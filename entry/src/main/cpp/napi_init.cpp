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

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "TodayColorNative", \
    "[TodayColor][NativeRenderer] " fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "TodayColorNative", \
    "[TodayColor][NativeRenderer] " fmt, ##__VA_ARGS__)

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
std::atomic<int32_t> g_operationId{0};
OHNativeWindow *g_window = nullptr;

struct RendererStatusSnapshot {
    int32_t operationId = 0;
    std::string stage = "idle";
    std::string message = "not started";
    uint32_t eglError = 0;
};

std::mutex g_statusMtx;
RendererStatusSnapshot g_status;

void UpdateRendererStatus(int32_t operationId, const char *stage, const char *message, uint32_t eglError = 0)
{
    std::lock_guard<std::mutex> statusLock(g_statusMtx);
    g_status.operationId = operationId;
    g_status.stage = stage;
    g_status.message = message;
    g_status.eglError = eglError;
    LOG("[op=%{public}d] status stage=%{public}s message=%{public}s eglError=0x%{public}x",
        operationId, stage, message, eglError);
}

RendererStatusSnapshot ReadRendererStatus()
{
    std::lock_guard<std::mutex> statusLock(g_statusMtx);
    return g_status;
}

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
    int32_t operationId = g_operationId.load();
    OHNativeWindow *window = g_window;
    LOG("[op=%{public}d] render loop entered", operationId);
    UpdateRendererStatus(operationId, "eglInitializing", "initializing EGL display and surface");
    if (!g_egl.Init(window)) {
        g_error = "EGL init failed";
        UpdateRendererStatus(operationId, "eglFailed", g_error.c_str(),
            static_cast<uint32_t>(g_egl.LastError()));
        g_egl.Release();
        ReleaseDisplayWindow(window);
        g_ok = false;
        g_running = false;
        LOGE("[op=%{public}d] render loop failed during EGL init", operationId);
        return;
    }
    // EGL buffer 与窗口短暂不一致时也必须等比裁切，禁止系统合成器分别拉伸宽高。
    int32_t scalingResult = OH_NativeWindow_NativeWindowSetScalingModeV2(
        window, OH_SCALING_MODE_SCALE_CROP_V2);
    if (scalingResult == 0) {
        LOG("[op=%{public}d] display scaling mode=aspect-preserving crop", operationId);
    } else {
        LOGE("[op=%{public}d] display scaling mode setup failed code=%{public}d; "
            "renderer will continue with exact-size buffers", operationId, scalingResult);
    }
    UpdateRendererStatus(operationId, "glInitializing", "initializing GL renderer and camera consumer");
    if (!g_renderer.Init()) {
        g_error = g_renderer.LastError().empty() ? "GL renderer init failed" : g_renderer.LastError();
        UpdateRendererStatus(operationId, "glFailed", g_error.c_str());
        g_renderer.Release();
        g_egl.Release();
        ReleaseDisplayWindow(window);
        g_ok = false;
        g_running = false;
        LOGE("[op=%{public}d] render loop failed during GL init", operationId);
        return;
    }
    uint64_t cameraSurfaceId = 0;
    OH_NativeWindow_GetSurfaceId(g_renderer.CameraWindow(), &cameraSurfaceId);
    LOG("[op=%{public}d] camera consumer surface ready valid=%{public}d",
        operationId, cameraSurfaceId != 0 ? 1 : 0);

    if (cameraSurfaceId == 0) {
        g_error = "camera consumer surface id unavailable";
        UpdateRendererStatus(operationId, "cameraSurfaceFailed", g_error.c_str());
        g_renderer.Release();
        g_egl.Release();
        ReleaseDisplayWindow(window);
        g_ok = false;
        g_running = false;
        return;
    }
    g_ok = true;
    UpdateRendererStatus(operationId, "ready", "renderer and camera consumer are ready");
    LOG("[op=%{public}d] renderer ready", operationId);

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
                LOG("[op=%{public}d] display geometry=%{public}dx%{public}d ret=%{public}d recreated=%{public}d",
                    operationId, tw, th, ret, recreated ? 1 : 0);
                if (ret != 0 || !recreated) {
                    g_error = "display surface resize failed";
                    UpdateRendererStatus(operationId, "surfaceResizeFailed", g_error.c_str(),
                        static_cast<uint32_t>(g_egl.LastError()));
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
        if (!g_egl.SwapBuffers()) {
            g_error = "eglSwapBuffers failed";
            UpdateRendererStatus(operationId, "swapFailed", g_error.c_str(),
                static_cast<uint32_t>(g_egl.LastError()));
            g_running = false;
        }
    }

    g_renderer.Release();
    g_egl.Release();
    ReleaseDisplayWindow(window);
    g_ok = false;
    g_running = false;
    if (g_error.empty()) {
        UpdateRendererStatus(operationId, "stopped", "renderer stopped without runtime error");
    }
    LOG("[op=%{public}d] render loop exit error=%{public}s", operationId,
        g_error.empty() ? "none" : g_error.c_str());
}

void StopRenderLoop()
{
    std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMtx);
    LOG("[op=%{public}d] renderer stop requested", g_operationId.load());
    g_running = false;
    if (g_thread.joinable()) {
        g_thread.join();
    }
    g_ok = false;
    if (g_error.empty()) {
        UpdateRendererStatus(g_operationId.load(), "stopped", "renderer stopped by lifecycle request");
    }
    LOG("[op=%{public}d] renderer stopped", g_operationId.load());
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
    LOG("[op=%{public}d] camera surface requested valid=%{public}d", g_operationId.load(), sid != 0 ? 1 : 0);
    napi_value out = nullptr;
    napi_create_string_utf8(env, text.c_str(), text.size(), &out);
    return out;
}

napi_value GetRendererStatus(napi_env env, napi_callback_info info)
{
    RendererStatusSnapshot status = ReadRendererStatus();
    napi_value out = nullptr;
    napi_create_object(env, &out);

    napi_value operationId = nullptr;
    napi_create_int32(env, status.operationId, &operationId);
    napi_set_named_property(env, out, "operationId", operationId);

    napi_value stage = nullptr;
    napi_create_string_utf8(env, status.stage.c_str(), status.stage.size(), &stage);
    napi_set_named_property(env, out, "stage", stage);

    napi_value message = nullptr;
    napi_create_string_utf8(env, status.message.c_str(), status.message.size(), &message);
    napi_set_named_property(env, out, "message", message);

    napi_value eglError = nullptr;
    napi_create_uint32(env, status.eglError, &eglError);
    napi_set_named_property(env, out, "eglError", eglError);

    napi_value running = nullptr;
    napi_get_boolean(env, g_running.load(), &running);
    napi_set_named_property(env, out, "running", running);

    napi_value ready = nullptr;
    napi_get_boolean(env, g_running.load() && g_ok.load(), &ready);
    napi_set_named_property(env, out, "ready", ready);
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
    LOG("[op=%{public}d] geometry update queued %{public}ux%{public}u", g_operationId.load(), w, h);
    return nullptr;
}

/** XComponentController 生命周期入口：SurfaceId 以 bigint/uint64_t 无损传递。 */
napi_value StartRenderer(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2] = {nullptr, nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc < 1) {
        return BoolValue(env, false);
    }
    uint64_t surfaceId = 0;
    uint32_t operationId = 0;
    bool lossless = false;
    if (argc >= 2) {
        napi_get_value_uint32(env, argv[1], &operationId);
    }
    if (napi_get_value_bigint_uint64(env, argv[0], &surfaceId, &lossless) != napi_ok
        || !lossless || surfaceId == 0) {
        UpdateRendererStatus(static_cast<int32_t>(operationId), "invalidSurface",
            "renderer start rejected because display surface id is invalid");
        LOGE("[op=%{public}u] start renderer rejected: invalid surface id", operationId);
        return BoolValue(env, false);
    }

    std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMtx);
    if (g_running) {
        LOG("[op=%{public}u] renderer already running activeOp=%{public}d",
            operationId, g_operationId.load());
        return BoolValue(env, true);
    }
    if (g_thread.joinable()) {
        g_thread.join();
    }

    OHNativeWindow *window = nullptr;
    if (OH_NativeWindow_CreateNativeWindowFromSurfaceId(surfaceId, &window) != 0
        || window == nullptr) {
        UpdateRendererStatus(static_cast<int32_t>(operationId), "nativeWindowFailed",
            "failed to create display NativeWindow from XComponent surface");
        LOGE("[op=%{public}u] CreateNativeWindowFromSurfaceId failed", operationId);
        return BoolValue(env, false);
    }
    g_operationId = static_cast<int32_t>(operationId);
    g_egl.SetOperationId(static_cast<int32_t>(operationId));
    g_renderer.SetOperationId(static_cast<int32_t>(operationId));
    g_window = window;
    g_error.clear();
    g_ok = false;
    g_running = true;
    UpdateRendererStatus(static_cast<int32_t>(operationId), "threadStarting",
        "display NativeWindow created; renderer thread starting");
    if (g_targetW > 0 && g_targetH > 0) {
        g_geometryDirty = true;
    }
    g_thread = std::thread(RenderLoop);
    LOG("[op=%{public}u] renderer thread start requested", operationId);
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
        {"getRendererStatus", nullptr, GetRendererStatus, nullptr, nullptr, nullptr, napi_default, nullptr},
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
