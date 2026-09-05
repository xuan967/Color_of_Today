#include <cstring>
#include <mutex>
#include <atomic>
#include <thread>

#include <GLES3/gl3.h>
#include <GLES2/gl2ext.h>
#include <hilog/log.h>
#include <napi/native_api.h>
#include <native_window/external_window.h>

#include "include/egl_core.h"
#include "include/gl_renderer.h"

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)

namespace {
EglCore g_egl;
GlRenderer g_renderer;

std::thread g_thread;
std::mutex g_lifecycleMtx;
std::string g_error;

std::atomic<bool> g_running{false};
std::atomic<bool> g_ok{false};
std::atomic<int32_t> g_targetW{0};
std::atomic<int32_t> g_targetH{0};
std::atomic<bool> g_geometryDirty{false};
OHNativeWindow *g_window = nullptr;

void ReleaseDisplayWindow(OHNativeWindow *window)
{
    if (window != nullptr) {
        OH_NativeWindow_DestroyNativeWindow(window);
    }
    g_window = nullptr;
}

/** 渲染线程入口：在拥有 EGL context 的线程上持续绘制 */
void RenderLoop()
{
    OHNativeWindow *window = g_window;
    if (!g_egl.Init(window)) {
        g_error = "EGL init failed";
        g_egl.Release();
        ReleaseDisplayWindow(window);
        g_ok = false;
        g_running = false;
        return;
    }
    // 合成器默认 NO_SCALE_CROP（buffer 1:1 顶格显示），改为拉伸铺满组件区域
    OH_NativeWindow_NativeWindowSetScalingModeV2(window, OH_SCALING_MODE_SCALE_TO_WINDOW_V2);
    if (!g_renderer.Init()) {
        g_error = g_error.empty() ? "GL renderer init failed" : g_error;
        g_renderer.Release();
        g_egl.Release();
        ReleaseDisplayWindow(window);
        g_ok = false;
        g_running = false;
        return;
    }
    uint64_t cameraSurfaceId = 0;
    OH_NativeWindow_GetSurfaceId(g_renderer.CameraWindow(), &cameraSurfaceId);
    LOG("camera surface id = %{public}llu", cameraSurfaceId);

    g_ok = true;

    int lastW = 0;
    int lastH = 0;
    while (g_running) {
        // ArkTS 侧下发组件真实像素尺寸：更新 buffer 几何并重建 EGLSurface
        if (g_geometryDirty.exchange(false)) {
            int32_t tw = g_targetW;
            int32_t th = g_targetH;
            if (tw > 0 && th > 0) {
                int32_t ret = OH_NativeWindow_NativeWindowHandleOpt(window, SET_BUFFER_GEOMETRY, tw, th);
                bool recreated = g_egl.RecreateSurface(window);
                lastW = 0;
                lastH = 0;
                LOG("buffer geometry set to %{public}dx%{public}d ret=%{public}d recreated=%{public}d",
                    tw, th, ret, recreated ? 1 : 0);
                if (ret != 0 || !recreated) {
                    g_error = "display surface resize failed";
                    g_running = false;
                    break;
                }
            }
        }
        int w = g_egl.SurfaceWidth();
        int h = g_egl.SurfaceHeight();
        if (w != lastW || h != lastH) {
            lastW = w;
            lastH = h;
            g_renderer.SetSurfaceSize(w, h);
        }
        g_renderer.DrawFrame();
        g_egl.SwapBuffers();
    }

    g_renderer.Release();
    g_egl.Release();
    ReleaseDisplayWindow(window);
    g_ok = false;
    g_running = false;
    LOG("render loop exit");
}

void StopRenderLoop()
{
    std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMtx);
    g_running = false;
    if (g_thread.joinable()) {
        g_thread.join();
    }
    g_ok = false;
}

napi_value BoolValue(napi_env env, bool v)
{
    napi_value out = nullptr;
    napi_get_boolean(env, v, &out);
    return out;
}

napi_value IsRendererReady(napi_env env, napi_callback_info info)
{
    return BoolValue(env, g_running && g_ok);
}

napi_value GetCameraSurfaceId(napi_env env, napi_callback_info info)
{
    uint64_t sid = 0;
    if (g_renderer.CameraWindow() != nullptr) {
        OH_NativeWindow_GetSurfaceId(g_renderer.CameraWindow(), &sid);
    }
    // Camera Kit 接收 string；直接返回十进制字符串，避免经过 JS number 丢失精度。
    std::string text = std::to_string(sid);
    napi_value out = nullptr;
    napi_create_string_utf8(env, text.c_str(), text.size(), &out);
    return out;
}

napi_value SetColor(napi_env env, napi_callback_info info)
{
    size_t argc = 3;
    napi_value argv[3] = {nullptr, nullptr, nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    double hue = 0.62, threshold = 0.05, boost = 1.2;
    if (argc >= 1) {
        napi_get_value_double(env, argv[0], &hue);
    }
    if (argc >= 2) {
        napi_get_value_double(env, argv[1], &threshold);
    }
    if (argc >= 3) {
        napi_get_value_double(env, argv[2], &boost);
    }
    g_renderer.SetColor((float)hue, (float)threshold, (float)boost);
    return nullptr;
}

napi_value SetPreviewSize(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2] = {nullptr, nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    uint32_t w = 0, h = 0;
    if (argc >= 1) {
        napi_get_value_uint32(env, argv[0], &w);
    }
    if (argc >= 2) {
        napi_get_value_uint32(env, argv[1], &h);
    }
    g_renderer.SetPreviewSize((int)w, (int)h);
    return nullptr;
}

napi_value SetMirror(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value argv[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    uint32_t mirror = 0;
    if (argc >= 1) {
        napi_get_value_uint32(env, argv[0], &mirror);
    }
    g_renderer.SetMirror((int)mirror);
    return nullptr;
}

/**
 * 阻塞式捕获：等待渲染线程下一帧读回滤镜后的像素。
 * 返回 { data: ArrayBuffer(BGRA, 自上而下), width: number, height: number }，失败返回 null。
 */
napi_value CaptureFrame(napi_env env, napi_callback_info info)
{
    if (!g_running || !g_ok) {
        return nullptr;
    }
    uint64_t token = g_renderer.RequestCapture();
    std::vector<uint8_t> data;
    int w = 0, h = 0;
    if (!g_renderer.WaitForCapture(token, data, w, h, 900)) {
        LOGE("capture timeout");
        return nullptr;
    }

    napi_value obj = nullptr;
    napi_create_object(env, &obj);
    void *abData = nullptr;
    napi_value ab = nullptr;
    if (napi_create_arraybuffer(env, data.size(), &abData, &ab) != napi_ok) {
        return nullptr;
    }
    std::memcpy(abData, data.data(), data.size());
    napi_set_named_property(env, obj, "data", ab);
    napi_value wv = nullptr, hv = nullptr;
    napi_create_int32(env, w, &wv);
    napi_create_int32(env, h, &hv);
    napi_set_named_property(env, obj, "width", wv);
    napi_set_named_property(env, obj, "height", hv);
    return obj;
}

napi_value SetSurfaceGeometry(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2] = {nullptr, nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    uint32_t w = 0, h = 0;
    if (argc >= 1) {
        napi_get_value_uint32(env, argv[0], &w);
    }
    if (argc >= 2) {
        napi_get_value_uint32(env, argv[1], &h);
    }
    g_targetW = (int32_t)w;
    g_targetH = (int32_t)h;
    g_geometryDirty = true;
    return nullptr;
}

/** XComponentController 生命周期入口：SurfaceId 以 bigint/uint64_t 无损传递。 */
napi_value StartRenderer(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value argv[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc < 1) {
        return BoolValue(env, false);
    }
    uint64_t surfaceId = 0;
    bool lossless = false;
    if (napi_get_value_bigint_uint64(env, argv[0], &surfaceId, &lossless) != napi_ok
        || !lossless || surfaceId == 0) {
        LOGE("start renderer: invalid surface id");
        return BoolValue(env, false);
    }

    std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMtx);
    if (g_running) {
        return BoolValue(env, true);
    }
    if (g_thread.joinable()) {
        g_thread.join();
    }

    OHNativeWindow *window = nullptr;
    if (OH_NativeWindow_CreateNativeWindowFromSurfaceId(surfaceId, &window) != 0
        || window == nullptr) {
        LOGE("CreateNativeWindowFromSurfaceId(%{public}llu) failed", surfaceId);
        return BoolValue(env, false);
    }
    g_window = window;
    g_error.clear();
    g_ok = false;
    g_running = true;
    if (g_targetW > 0 && g_targetH > 0) {
        g_geometryDirty = true;
    }
    g_thread = std::thread(RenderLoop);
    LOG("renderer start requested for surfaceId %{public}llu", surfaceId);
    return BoolValue(env, true);
}

napi_value ReleaseRenderer(napi_env env, napi_callback_info info)
{
    StopRenderLoop();
    return nullptr;
}

napi_value Init(napi_env env, napi_value exports)
{
    napi_property_descriptor desc[] = {
        {"startRenderer", nullptr, StartRenderer, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"isRendererReady", nullptr, IsRendererReady, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"getCameraSurfaceId", nullptr, GetCameraSurfaceId, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setSurfaceGeometry", nullptr, SetSurfaceGeometry, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setColor", nullptr, SetColor, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setPreviewSize", nullptr, SetPreviewSize, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setMirror", nullptr, SetMirror, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"captureFrame", nullptr, CaptureFrame, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"releaseRenderer", nullptr, ReleaseRenderer, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}

} // namespace

EXTERN_C_START
static napi_value ModuleInit(napi_env env, napi_value exports)
{
    return Init(env, exports);
}
EXTERN_C_END

static napi_module colorFilterModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = ModuleInit,
    .nm_modname = "entry",
    .nm_priv = nullptr,
    .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterColorFilterModule(void)
{
    napi_module_register(&colorFilterModule);
}
