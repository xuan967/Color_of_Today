#include "include/gl_renderer.h"

#include <cmath>
#include <cstring>
#include <hilog/log.h>

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "TodayColorNative", \
    "[TodayColor][NativeRenderer] " fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "TodayColorNative", \
    "[TodayColor][NativeRenderer] " fmt, ##__VA_ARGS__)

// 本 SDK 头文件缺失的 ES 核心常量与函数（GLES 规范值，链接期由 libGLESv3 解析）
#ifndef GL_TEXTURE_WIDTH
#define GL_TEXTURE_WIDTH 0x1000
#endif
#ifndef GL_TEXTURE_HEIGHT
#define GL_TEXTURE_HEIGHT 0x1001
#endif
extern "C" void glGetTexLevelParameteriv(GLenum target, GLint level, GLenum pname, GLint *params);

namespace {
const char *VSH = R"(#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
uniform float uMirror;
out vec2 vUV;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
    vUV = aUV;
})";

const char *FSH = R"(#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;
in vec2 vUV;
uniform samplerExternalOES uTexture;
uniform vec2 uCover;
uniform mat4 uTexMatrix;   // API 12 NativeImage V2 完整变换：旋转 + 平移
uniform vec4 uPad;        // 纹理对齐黑边：uStart, uSpan, vStart, vSpan
uniform float uMirror;
uniform float uTargetHue;
uniform float uThreshold;
uniform float uSatBoost;
out vec4 outColor;

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

void main() {
    // 1. 镜像和 cover 都属于屏幕坐标；必须先执行，再映射到相机纹理坐标。
    vec2 displayUV = vUV;
    if (uMirror > 0.5) {
        displayUV.x = 1.0 - displayUV.x;
    }
    displayUV = (displayUV - 0.5) * uCover + 0.5;
    vec2 transformedUV = (uTexMatrix * vec4(displayUV, 0.0, 1.0)).xy;

    // 2. 可选的纹理分配 padding 属于纹理坐标，最后应用。
    vec2 tc = clamp(vec2(uPad.x + transformedUV.x * uPad.y,
        uPad.z + transformedUV.y * uPad.w), vec2(0.0), vec2(1.0));

    vec3 rgb = texture(uTexture, tc).rgb;
    vec3 hsv = rgb2hsv(rgb);

    // 色相环首尾相接的环形距离
    float diff = abs(hsv.x - uTargetHue);
    diff = min(diff, 1.0 - diff);

    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));

    // 命中判定：色相阈值内保留 + 低饱和度区域门限（避免灰色物体随机“命中”闪烁）
    float keepHue = 1.0 - smoothstep(uThreshold * 0.65, uThreshold, diff);
    float keepSat = smoothstep(0.08, 0.22, hsv.y);
    float keep = keepHue * keepSat;

    // 黑白区：亮度公式 + 轻微对比度提升，让画面更有胶片质感
    vec3 gray = clamp((vec3(lum) - 0.5) * 1.10 + 0.53, 0.0, 1.0);

    // 彩色区：按增益提升饱和度
    vec3 colored = clamp(mix(vec3(lum), rgb, uSatBoost), 0.0, 1.0);

    outColor = vec4(mix(gray, colored, keep), 1.0);
})";

GLuint CompileShader(GLenum type, const char *src, int32_t operationId)
{
    GLuint sh = glCreateShader(type);
    glShaderSource(sh, 1, &src, nullptr);
    glCompileShader(sh);
    GLint ok = 0;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[512] = {0};
        glGetShaderInfoLog(sh, sizeof(log), nullptr, log);
        LOGE("[op=%{public}d] shader compile error: %{public}s", operationId, log);
        glDeleteShader(sh);
        return 0;
    }
    return sh;
}
} // namespace

void GlRenderer::OnFrameAvailable(void *context)
{
    if (context == nullptr) {
        return;
    }
    auto *renderer = static_cast<GlRenderer *>(context);
    // NativeImage 回调线程只发布通知，不调用任何 NativeImage 接口。
    renderer->frameAvailableSequence_.fetch_add(1, std::memory_order_release);
}

bool GlRenderer::Init()
{
    lastError_.clear();
    firstFrameLogged_ = false;
    firstFrameNotificationLogged_ = false;
    frameAvailableSequence_.store(0, std::memory_order_relaxed);
    consumedFrameSequence_ = 0;
    failedFrameConsumeCount_ = 0;
    std::memset(textureTransform_, 0, sizeof(textureTransform_));
    textureTransform_[0] = 1.0f;
    textureTransform_[5] = 1.0f;
    textureTransform_[10] = 1.0f;
    textureTransform_[15] = 1.0f;
    const char *glVersion = reinterpret_cast<const char *>(glGetString(GL_VERSION));
    const char *extensions = reinterpret_cast<const char *>(glGetString(GL_EXTENSIONS));
    bool externalEssl3Supported = extensions != nullptr
        && std::strstr(extensions, "GL_OES_EGL_image_external_essl3") != nullptr;
    LOG("[op=%{public}d] GL renderer init begin version=%{public}s externalEssl3=%{public}d",
        operationId_, glVersion == nullptr ? "unavailable" : glVersion, externalEssl3Supported ? 1 : 0);
    if (!BuildProgram()) {
        if (lastError_.empty()) {
            lastError_ = "shader program build failed";
        }
        LOGE("[op=%{public}d] GL program build failed", operationId_);
        return false;
    }

    static const GLfloat quad[] = {
        -1.f, -1.f, 0.f, 1.f,
         1.f, -1.f, 1.f, 1.f,
        -1.f,  1.f, 0.f, 0.f,
         1.f,  1.f, 1.f, 0.f,
    };
    glGenVertexArrays(1, &vao_);
    glBindVertexArray(vao_);
    glGenBuffers(1, &vbo_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quad), quad, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(GLfloat), (void *)0);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(GLfloat), (void *)(2 * sizeof(GLfloat)));
    glBindVertexArray(0);

    glGenTextures(1, &oesTex_);
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, oesTex_);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    image_ = OH_NativeImage_Create(oesTex_, GL_TEXTURE_EXTERNAL_OES);
    if (image_ == nullptr) {
        lastError_ = "OH_NativeImage_Create failed";
        LOGE("[op=%{public}d] OH_NativeImage_Create failed", operationId_);
        return false;
    }
    OH_OnFrameAvailableListener listener = {this, &GlRenderer::OnFrameAvailable};
    int32_t listenerResult = OH_NativeImage_SetOnFrameAvailableListener(image_, listener);
    if (listenerResult != 0) {
        lastError_ = "NativeImage frame listener registration failed";
        LOGE("[op=%{public}d] frame listener registration failed code=%{public}d",
            operationId_, listenerResult);
        return false;
    }
    frameListenerRegistered_ = true;
    LOG("[op=%{public}d] frame listener registered", operationId_);
    imageWindow_ = OH_NativeImage_AcquireNativeWindow(image_);
    if (imageWindow_ == nullptr) {
        lastError_ = "OH_NativeImage_AcquireNativeWindow failed";
        LOGE("[op=%{public}d] AcquireNativeWindow failed", operationId_);
        return false;
    }
    LOG("[op=%{public}d] GL renderer init completed", operationId_);
    return true;
}

bool GlRenderer::BuildProgram()
{
    LOG("[op=%{public}d] shader compile/link begin", operationId_);
    GLuint vsh = CompileShader(GL_VERTEX_SHADER, VSH, operationId_);
    GLuint fsh = CompileShader(GL_FRAGMENT_SHADER, FSH, operationId_);
    if (vsh == 0 || fsh == 0) {
        lastError_ = "shader compilation failed";
        return false;
    }
    program_ = glCreateProgram();
    glAttachShader(program_, vsh);
    glAttachShader(program_, fsh);
    glLinkProgram(program_);
    glDeleteShader(vsh);
    glDeleteShader(fsh);
    GLint ok = 0;
    glGetProgramiv(program_, GL_LINK_STATUS, &ok);
    if (!ok) {
        lastError_ = "shader program link failed";
        char log[512] = {0};
        glGetProgramInfoLog(program_, sizeof(log), nullptr, log);
        LOGE("[op=%{public}d] program link error: %{public}s", operationId_, log);
        return false;
    }
    locTex_ = glGetUniformLocation(program_, "uTexture");
    locHue_ = glGetUniformLocation(program_, "uTargetHue");
    locThreshold_ = glGetUniformLocation(program_, "uThreshold");
    locBoost_ = glGetUniformLocation(program_, "uSatBoost");
    locCover_ = glGetUniformLocation(program_, "uCover");
    locTexMatrix_ = glGetUniformLocation(program_, "uTexMatrix");
    locPad_ = glGetUniformLocation(program_, "uPad");
    locMirror_ = glGetUniformLocation(program_, "uMirror");
    LOG("[op=%{public}d] shader compile/link completed program=%{public}u", operationId_, program_);
    return true;
}

void GlRenderer::Release()
{
    LOG("[op=%{public}d] GL renderer release begin", operationId_);
    {
        std::lock_guard<std::mutex> lk(capMtx_);
        capPending_ = false;
        capData_.clear();
        capW_ = 0;
        capH_ = 0;
    }
    capCv_.notify_all();
    if (image_ != nullptr) {
        if (frameListenerRegistered_) {
            int32_t unsetResult = OH_NativeImage_UnsetOnFrameAvailableListener(image_);
            LOG("[op=%{public}d] frame listener removed code=%{public}d", operationId_, unsetResult);
            frameListenerRegistered_ = false;
        }
        OH_NativeImage_Destroy(&image_);
        image_ = nullptr;
        imageWindow_ = nullptr;
    }
    if (vbo_ != 0) {
        glDeleteBuffers(1, &vbo_);
        vbo_ = 0;
    }
    if (vao_ != 0) {
        glDeleteVertexArrays(1, &vao_);
        vao_ = 0;
    }
    if (oesTex_ != 0) {
        glDeleteTextures(1, &oesTex_);
        oesTex_ = 0;
    }
    if (program_ != 0) {
        glDeleteProgram(program_);
        program_ = 0;
    }
    firstFrameLogged_ = false;
    firstFrameNotificationLogged_ = false;
    frameAvailableSequence_.store(0, std::memory_order_relaxed);
    consumedFrameSequence_ = 0;
    failedFrameConsumeCount_ = 0;
    LOG("[op=%{public}d] GL renderer release completed", operationId_);
}

void GlRenderer::SetSurfaceSize(int w, int h)
{
    std::lock_guard<std::mutex> lk(paramMtx_);
    if (surfW_ != w || surfH_ != h) {
        float aspect = h > 0 ? static_cast<float>(w) / static_cast<float>(h) : 0.0f;
        LOG("[op=%{public}d] EGL surface size=%{public}dx%{public}d aspect=%{public}.4f",
            operationId_, w, h, aspect);
    }
    surfW_ = w;
    surfH_ = h;
}

void GlRenderer::SetColor(float hue, float threshold, float satBoost)
{
    std::lock_guard<std::mutex> lk(paramMtx_);
    hue_ = hue;
    threshold_ = threshold;
    satBoost_ = satBoost;
    LOG("set color hue=%{public}f thr=%{public}f boost=%{public}f", hue, threshold, satBoost);
}

void GlRenderer::SetPreviewSize(int w, int h)
{
    std::lock_guard<std::mutex> lk(paramMtx_);
    bufW_ = w;
    bufH_ = h;
    padComputed_ = false;
    LOG("[op=%{public}d] camera buffer size=%{public}dx%{public}d", operationId_, w, h);
}

void GlRenderer::SetMirror(int mirror)
{
    std::lock_guard<std::mutex> lk(paramMtx_);
    mirror_ = mirror > 0 ? 1.0f : 0.0f;
}

uint64_t GlRenderer::RequestCapture()
{
    std::lock_guard<std::mutex> lk(capMtx_);
    capPending_ = true;
    uint64_t token = ++capSeq_;
    LOG("[op=%{public}d] capture requested token=%{public}llu", operationId_, token);
    return token;
}

bool GlRenderer::WaitForCapture(uint64_t token, std::vector<uint8_t> &out, int &w, int &h, int timeoutMs)
{
    std::unique_lock<std::mutex> lk(capMtx_);
    bool done = capCv_.wait_for(lk, std::chrono::milliseconds(timeoutMs),
        [this, token] { return !capPending_ && capSeq_ >= token; });
    if (!done) {
        LOGE("[op=%{public}d] capture wait timeout token=%{public}llu", operationId_, token);
        return false;
    }
    out = std::move(capData_);
    capData_.clear();
    w = capW_;
    h = capH_;
    LOG("[op=%{public}d] capture delivered token=%{public}llu size=%{public}dx%{public}d bytes=%{public}zu",
        operationId_, token, w, h, out.size());
    return !out.empty();
}

/**
 * 查询 OES 纹理实际分配尺寸，与相机 buffer 尺寸求比值得内容矩形。
 * 部分设备纹理按对齐尺寸分配（如 720 宽内容分配 1280 宽纹理、内容居中）；
 * 查询失败或相等则视为无黑边（真机常态）。
 */
void GlRenderer::EnsureTexturePad()
{
    std::lock_guard<std::mutex> lk(paramMtx_);
    if (padComputed_ || bufW_ <= 0 || bufH_ <= 0) {
        return;
    }
    padComputed_ = true;
    padUStart_ = 0.0f;
    padUSpan_ = 1.0f;
    padVStart_ = 0.0f;
    padVSpan_ = 1.0f;

    GLint tw = 0;
    GLint th = 0;
    glGetTexLevelParameteriv(GL_TEXTURE_EXTERNAL_OES, 0, GL_TEXTURE_WIDTH, &tw);
    glGetTexLevelParameteriv(GL_TEXTURE_EXTERNAL_OES, 0, GL_TEXTURE_HEIGHT, &th);
    LOG("[op=%{public}d] texture allocation=%{public}dx%{public}d cameraBuffer=%{public}dx%{public}d",
        operationId_, tw, th, bufW_, bufH_);
    if (tw <= 0 || th <= 0) {
        return;
    }
    if (tw > bufW_) {
        padUSpan_ = (float)bufW_ / (float)tw;
        padUStart_ = (float)(tw - bufW_) / 2.0f / (float)tw;
    }
    if (th > bufH_) {
        padVSpan_ = (float)bufH_ / (float)th;
        padVStart_ = (float)(th - bufH_) / 2.0f / (float)th;
    }
    LOG("[op=%{public}d] texture pad u=[%{public}.3f +%{public}.3f] v=[%{public}.3f +%{public}.3f]",
        operationId_, padUStart_, padUSpan_, padVStart_, padVSpan_);
}

void GlRenderer::DrawFrame()
{
    bool imageUpdated = false;
    uint64_t availableSequence = frameAvailableSequence_.load(std::memory_order_acquire);
    if (!firstFrameNotificationLogged_ && availableSequence > 0) {
        firstFrameNotificationLogged_ = true;
        LOG("[op=%{public}d] first native frame notification sequence=%{public}llu",
            operationId_, availableSequence);
    }
    if (image_ != nullptr && availableSequence != consumedFrameSequence_) {
        int32_t updateResult = OH_NativeImage_UpdateSurfaceImage(image_);
        // 一次通知最多触发一次消费尝试；失败时等待下一次生产者通知，避免忙循环耗尽 buffer。
        consumedFrameSequence_ = availableSequence;
        imageUpdated = updateResult == 0;
        if (imageUpdated) {
            float m[16];
            int32_t matrixResult = OH_NativeImage_GetTransformMatrixV2(image_, m);
            if (matrixResult == 0) {
                // 只有完整成功消费的帧才能替换方向；失败/无新帧始终沿用最后一个有效矩阵。
                std::memcpy(textureTransform_, m, sizeof(textureTransform_));
            } else {
                LOGE("[op=%{public}d] transform query failed code=%{public}d; retaining cached transform",
                    operationId_, matrixResult);
            }
            EnsureTexturePad();
        } else {
            failedFrameConsumeCount_++;
            if (failedFrameConsumeCount_ == 1 || failedFrameConsumeCount_ % 60 == 0) {
                LOGE("[op=%{public}d] frame consume failed code=%{public}d count=%{public}llu; "
                    "retaining cached transform", operationId_, updateResult, failedFrameConsumeCount_);
            }
        }
    }

    float texMatrix[16];
    std::memcpy(texMatrix, textureTransform_, sizeof(texMatrix));

    float hue = 0.62f;
    float threshold = 0.05f;
    float satBoost = 1.2f;
    float mirror = 0.0f;
    float padUStart = 0.0f;
    float padUSpan = 1.0f;
    float padVStart = 0.0f;
    float padVSpan = 1.0f;
    int surfaceWidth = 0;
    int surfaceHeight = 0;
    int bufferWidth = 0;
    int bufferHeight = 0;
    {
        std::lock_guard<std::mutex> lk(paramMtx_);
        hue = hue_;
        threshold = threshold_;
        satBoost = satBoost_;
        mirror = mirror_;
        padUStart = padUStart_;
        padUSpan = padUSpan_;
        padVStart = padVStart_;
        padVSpan = padVSpan_;
        surfaceWidth = surfW_;
        surfaceHeight = surfH_;
        bufferWidth = bufW_;
        bufferHeight = bufH_;
    }

    if (surfaceWidth <= 0 || surfaceHeight <= 0) {
        return;
    }

    glViewport(0, 0, surfaceWidth, surfaceHeight);
    glClearColor(0.f, 0.f, 0.f, 1.f);
    glClear(GL_COLOR_BUFFER_BIT);

    glUseProgram(program_);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, oesTex_);
    glUniform1i(locTex_, 0);
    glUniform1f(locHue_, hue);
    glUniform1f(locThreshold_, threshold);
    glUniform1f(locBoost_, satBoost);

    // cover：旋转后有效宽高比 vs Surface 宽高比（TexM 含 90° 旋转时轴互换）
    float sx = 1.f, sy = 1.f;
    float surfaceAspect = 0.f;
    float bufferAspect = 0.f;
    if (bufferWidth > 0 && bufferHeight > 0) {
        bool rotated = std::fabs(texMatrix[1]) + std::fabs(texMatrix[4]) >
            std::fabs(texMatrix[0]) + std::fabs(texMatrix[5]);
        float effW = rotated ? (float)bufferHeight : (float)bufferWidth;
        float effH = rotated ? (float)bufferWidth : (float)bufferHeight;
        surfaceAspect = (float)surfaceWidth / (float)surfaceHeight;
        bufferAspect = effW / effH;
        if (bufferAspect > surfaceAspect) {
            sx = surfaceAspect / bufferAspect;
        } else {
            sy = bufferAspect / surfaceAspect;
        }
    }

    if (!firstFrameLogged_ && imageUpdated && bufferWidth > 0 && bufferHeight > 0) {
        firstFrameLogged_ = true;
        LOG("[op=%{public}d] first GL frame surface=%{public}dx%{public}d buffer=%{public}dx%{public}d "
            "aspect=surface:%{public}.4f/buffer:%{public}.4f cover=%{public}.4fx%{public}.4f "
            "matrix=[%{public}.3f,%{public}.3f,%{public}.3f,%{public}.3f] "
            "translate=[%{public}.3f,%{public}.3f] pad=[%{public}.3f,%{public}.3f,%{public}.3f,%{public}.3f]",
            operationId_, surfaceWidth, surfaceHeight, bufferWidth, bufferHeight,
            surfaceAspect, bufferAspect, sx, sy,
            texMatrix[0], texMatrix[1], texMatrix[4], texMatrix[5], texMatrix[12], texMatrix[13],
            padUStart, padUSpan, padVStart, padVSpan);
    }

    glUniform2f(locCover_, sx, sy);
    glUniformMatrix4fv(locTexMatrix_, 1, GL_FALSE, texMatrix);
    glUniform4f(locPad_, padUStart, padUSpan, padVStart, padVSpan);
    glUniform1f(locMirror_, mirror);

    glBindVertexArray(vao_);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    glBindVertexArray(0);

    HandleCapture(surfaceWidth, surfaceHeight);
}

void GlRenderer::HandleCapture(int surfaceWidth, int surfaceHeight)
{
    std::unique_lock<std::mutex> lk(capMtx_, std::try_to_lock);
    if (!lk.owns_lock() || !capPending_) {
        return;
    }
    if (surfaceWidth <= 0 || surfaceHeight <= 0) {
        return;
    }
    std::vector<uint8_t> rgba(surfaceWidth * surfaceHeight * 4);
    glReadPixels(0, 0, surfaceWidth, surfaceHeight, GL_RGBA, GL_UNSIGNED_BYTE, rgba.data());
    // glReadPixels 自下而上、RGBA —— 翻转并转换为自上而下 BGRA（PixelMap BGRA_8888 直接可用）
    std::vector<uint8_t> bgra(rgba.size());
    int rowBytes = surfaceWidth * 4;
    for (int y = 0; y < surfaceHeight; y++) {
        const uint8_t *src = rgba.data() + (surfaceHeight - 1 - y) * rowBytes;
        uint8_t *dst = bgra.data() + y * rowBytes;
        for (int x = 0; x < surfaceWidth; x++) {
            dst[x * 4 + 0] = src[x * 4 + 2];
            dst[x * 4 + 1] = src[x * 4 + 1];
            dst[x * 4 + 2] = src[x * 4 + 0];
            dst[x * 4 + 3] = src[x * 4 + 3];
        }
    }
    capData_ = std::move(bgra);
    capW_ = surfaceWidth;
    capH_ = surfaceHeight;
    capPending_ = false;
    lk.unlock();
    capCv_.notify_all();
}
