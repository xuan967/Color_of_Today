#include "include/gl_renderer.h"

#include <cstring>
#include <hilog/log.h>

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)

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
    vec2 uv = aUV;
    if (uMirror > 0.5) {
        uv.x = 1.0 - uv.x;
    }
    vUV = uv;
})";

const char *FSH = R"(#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;
in vec2 vUV;
uniform samplerExternalOES uTexture;
uniform vec2 uCover;
uniform vec4 uTexLin;     // 系统 TexMatrix 的 2x2 线性部分（旋转/镜像，列主序 m0,m1,m4,m5）
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
    // 1. 镜像 + 绕中心应用系统旋转/镜像（线性部分），平移自己补，规避个别实现的缺平移问题
    vec2 uv = vUV;
    if (uMirror > 0.5) {
        uv.x = 1.0 - uv.x;
    }
    vec2 p;
    p.x = uTexLin.x * (uv.x - 0.5) + uTexLin.z * (uv.y - 0.5) + 0.5;
    p.y = uTexLin.y * (uv.x - 0.5) + uTexLin.w * (uv.y - 0.5) + 0.5;

    // 2. 纹理对齐黑边裁剪：映射到帧内容有效矩形
    vec2 st = vec2(uPad.x + p.x * uPad.y, uPad.z + p.y * uPad.w);

    // 3. cover 铺满：等比缩放、居中裁切
    vec2 tc = clamp((st - 0.5) * uCover + 0.5, vec2(0.0), vec2(1.0));

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

GLuint CompileShader(GLenum type, const char *src)
{
    GLuint sh = glCreateShader(type);
    glShaderSource(sh, 1, &src, nullptr);
    glCompileShader(sh);
    GLint ok = 0;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[512] = {0};
        glGetShaderInfoLog(sh, sizeof(log), nullptr, log);
        LOGE("shader compile error: %{public}s", log);
        glDeleteShader(sh);
        return 0;
    }
    return sh;
}
} // namespace

bool GlRenderer::Init()
{
    if (!BuildProgram()) {
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
        LOGE("OH_NativeImage_Create failed");
        return false;
    }
    imageWindow_ = OH_NativeImage_AcquireNativeWindow(image_);
    if (imageWindow_ == nullptr) {
        LOGE("AcquireNativeWindow failed");
        return false;
    }
    LOG("renderer init ok");
    return true;
}

bool GlRenderer::BuildProgram()
{
    GLuint vsh = CompileShader(GL_VERTEX_SHADER, VSH);
    GLuint fsh = CompileShader(GL_FRAGMENT_SHADER, FSH);
    if (vsh == 0 || fsh == 0) {
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
        char log[512] = {0};
        glGetProgramInfoLog(program_, sizeof(log), nullptr, log);
        LOGE("program link error: %{public}s", log);
        return false;
    }
    locTex_ = glGetUniformLocation(program_, "uTexture");
    locHue_ = glGetUniformLocation(program_, "uTargetHue");
    locThreshold_ = glGetUniformLocation(program_, "uThreshold");
    locBoost_ = glGetUniformLocation(program_, "uSatBoost");
    locCover_ = glGetUniformLocation(program_, "uCover");
    locTexLin_ = glGetUniformLocation(program_, "uTexLin");
    locPad_ = glGetUniformLocation(program_, "uPad");
    locMirror_ = glGetUniformLocation(program_, "uMirror");
    return true;
}

void GlRenderer::Release()
{
    if (image_ != nullptr) {
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
}

void GlRenderer::SetSurfaceSize(int w, int h)
{
    surfW_ = w;
    surfH_ = h;
}

void GlRenderer::SetColor(float hue, float threshold, float satBoost)
{
    hue_ = hue;
    threshold_ = threshold;
    satBoost_ = satBoost;
    LOG("set color hue=%{public}f thr=%{public}f boost=%{public}f", hue, threshold, satBoost);
}

void GlRenderer::SetPreviewSize(int w, int h)
{
    bufW_ = w;
    bufH_ = h;
    padComputed_ = false;
}

void GlRenderer::SetMirror(int mirror)
{
    mirror_ = mirror > 0 ? 1.0f : 0.0f;
}

uint64_t GlRenderer::RequestCapture()
{
    std::lock_guard<std::mutex> lk(capMtx_);
    capPending_ = true;
    return ++capSeq_;
}

bool GlRenderer::WaitForCapture(uint64_t token, std::vector<uint8_t> &out, int &w, int &h, int timeoutMs)
{
    std::unique_lock<std::mutex> lk(capMtx_);
    bool done = capCv_.wait_for(lk, std::chrono::milliseconds(timeoutMs),
        [this, token] { return !capPending_ && capSeq_ >= token; });
    if (!done) {
        return false;
    }
    out = std::move(capData_);
    capData_.clear();
    w = capW_;
    h = capH_;
    return !out.empty();
}

/**
 * 查询 OES 纹理实际分配尺寸，与相机 buffer 尺寸求比值得内容矩形。
 * 部分设备纹理按对齐尺寸分配（如 720 宽内容分配 1280 宽纹理、内容居中）；
 * 查询失败或相等则视为无黑边（真机常态）。
 */
void GlRenderer::EnsureTexturePad()
{
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
    LOG("texture level params: %{public}dx%{public}d, buffer %{public}dx%{public}d", tw, th, bufW_, bufH_);
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
    LOG("pad: u=[%{public}.3f +%{public}.3f] v=[%{public}.3f +%{public}.3f]",
        padUStart_, padUSpan_, padVStart_, padVSpan_);
}

void GlRenderer::DrawFrame()
{
    float texLin[4] = {1.0f, 0.0f, 0.0f, 1.0f};
    if (image_ != nullptr) {
        OH_NativeImage_UpdateSurfaceImage(image_);
        float m[16];
        OH_NativeImage_GetTransformMatrix(image_, m);
        // 列主序 2x2 线性部分：col0=(m0,m1) col1=(m4,m5)
        texLin[0] = m[0];
        texLin[1] = m[1];
        texLin[2] = m[4];
        texLin[3] = m[5];
        EnsureTexturePad();
    }

    glViewport(0, 0, surfW_, surfH_);
    glClearColor(0.f, 0.f, 0.f, 1.f);
    glClear(GL_COLOR_BUFFER_BIT);

    glUseProgram(program_);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, oesTex_);
    glUniform1i(locTex_, 0);
    glUniform1f(locHue_, hue_);
    glUniform1f(locThreshold_, threshold_);
    glUniform1f(locBoost_, satBoost_);

    // cover：旋转后有效宽高比 vs Surface 宽高比（TexM 含 90° 旋转时轴互换）
    float sx = 1.f, sy = 1.f;
    if (bufW_ > 0 && bufH_ > 0 && surfW_ > 0 && surfH_ > 0) {
        bool rotated = std::fabs(texLin[1]) + std::fabs(texLin[2]) > std::fabs(texLin[0]) + std::fabs(texLin[3]);
        float effW = rotated ? (float)bufH_ : (float)bufW_;
        float effH = rotated ? (float)bufW_ : (float)bufH_;
        float sa = (float)surfW_ / (float)surfH_;
        float ba = effW / effH;
        if (ba > sa) {
            sx = sa / ba;
        } else {
            sy = ba / sa;
        }
    }

    glUniform2f(locCover_, sx, sy);
    glUniform4f(locTexLin_, texLin[0], texLin[1], texLin[2], texLin[3]);
    glUniform4f(locPad_, padUStart_, padUSpan_, padVStart_, padVSpan_);
    glUniform1f(locMirror_, mirror_);

    glBindVertexArray(vao_);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    glBindVertexArray(0);

    HandleCapture();
}

void GlRenderer::HandleCapture()
{
    std::unique_lock<std::mutex> lk(capMtx_, std::try_to_lock);
    if (!lk.owns_lock() || !capPending_) {
        return;
    }
    if (surfW_ <= 0 || surfH_ <= 0) {
        return;
    }
    std::vector<uint8_t> rgba(surfW_ * surfH_ * 4);
    glReadPixels(0, 0, surfW_, surfH_, GL_RGBA, GL_UNSIGNED_BYTE, rgba.data());
    // glReadPixels 自下而上、RGBA —— 翻转并转换为自上而下 BGRA（PixelMap BGRA_8888 直接可用）
    std::vector<uint8_t> bgra(rgba.size());
    int rowBytes = surfW_ * 4;
    for (int y = 0; y < surfH_; y++) {
        const uint8_t *src = rgba.data() + (surfH_ - 1 - y) * rowBytes;
        uint8_t *dst = bgra.data() + y * rowBytes;
        for (int x = 0; x < surfW_; x++) {
            dst[x * 4 + 0] = src[x * 4 + 2];
            dst[x * 4 + 1] = src[x * 4 + 1];
            dst[x * 4 + 2] = src[x * 4 + 0];
            dst[x * 4 + 3] = src[x * 4 + 3];
        }
    }
    capData_ = std::move(bgra);
    capW_ = surfW_;
    capH_ = surfH_;
    capPending_ = false;
    lk.unlock();
    capCv_.notify_all();
}
