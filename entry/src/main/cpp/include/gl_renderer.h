#pragma once
#include <atomic>
#include <cstdint>
#include <GLES3/gl3.h>
#include <GLES2/gl2ext.h>
#include <condition_variable>
#include <mutex>
#include <string>
#include <vector>

#include <native_image/native_image.h>
#include <native_window/external_window.h>

/**
 * 颜色隔离渲染器。
 *
 * 管线：相机帧 → OH_NativeImage(OES 纹理) → Fragment Shader 色相隔离 → 输出 Surface。
 * DrawFrame 必须在 EGL context 所在线程调用；参数 Setter 可从 JS 线程调用。
 *
 * 几何自适应策略（不同设备纹理对齐行为不同，禁止写死 crop）：
 * - 旋转/平移：完整保留 API 12 NativeImage V2 的 4x4 变换矩阵
 * - 纹理对齐黑边：首帧后查询纹理实际分配尺寸，与 buffer 尺寸求比值得内容矩形
 * - 铺满裁剪：在屏幕坐标系等比 cover 后，再映射到相机纹理坐标
 */
class GlRenderer {
public:
    void SetOperationId(int32_t operationId) { operationId_ = operationId; }
    bool Init();
    void Release();

    void SetSurfaceSize(int w, int h);
    void SetColor(float hue, float threshold, float satBoost);
    void SetPreviewSize(int w, int h);
    void SetMirror(int mirror);

    OHNativeWindow *CameraWindow() const { return imageWindow_; }

    /** 请求在下一帧渲染后读回像素（BGRA、自上而下）。返回请求序号。 */
    uint64_t RequestCapture();
    /** 阻塞等待指定序号的捕获结果，超时返回 false。 */
    bool WaitForCapture(uint64_t token, std::vector<uint8_t> &out, int &w, int &h, int timeoutMs);

    void DrawFrame();

private:
    static void OnFrameAvailable(void *context);
    bool BuildProgram();
    void EnsureTexturePad();
    void HandleCapture(int surfaceWidth, int surfaceHeight);

    GLuint program_ = 0;
    GLuint vao_ = 0;
    GLuint vbo_ = 0;
    GLuint oesTex_ = 0;

    OH_NativeImage *image_ = nullptr;
    OHNativeWindow *imageWindow_ = nullptr;
    bool frameListenerRegistered_ = false;
    std::atomic<uint64_t> frameAvailableSequence_{0};
    uint64_t consumedFrameSequence_ = 0;
    uint64_t failedFrameConsumeCount_ = 0;
    float textureTransform_[16] = {
        1.0f, 0.0f, 0.0f, 0.0f,
        0.0f, 1.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f,
        0.0f, 0.0f, 0.0f, 1.0f
    };

    GLint locTex_ = -1;
    GLint locHue_ = -1;
    GLint locThreshold_ = -1;
    GLint locBoost_ = -1;
    GLint locCover_ = -1;
    GLint locTexMatrix_ = -1;
    GLint locPad_ = -1;
    GLint locMirror_ = -1;

    float hue_ = 0.62f;
    float threshold_ = 0.05f;
    float satBoost_ = 1.2f;
    float mirror_ = 0.0f;
    int surfW_ = 0;
    int surfH_ = 0;
    int bufW_ = 0;
    int bufH_ = 0;
    bool padComputed_ = false;
    float padUStart_ = 0.0f;
    float padUSpan_ = 1.0f;
    float padVStart_ = 0.0f;
    float padVSpan_ = 1.0f;
    std::mutex paramMtx_;

    std::mutex capMtx_;
    std::condition_variable capCv_;
    bool capPending_ = false;
    uint64_t capSeq_ = 0;
    std::vector<uint8_t> capData_;
    int capW_ = 0;
    int capH_ = 0;
    int32_t operationId_ = 0;
    bool firstFrameLogged_ = false;
    bool firstFrameNotificationLogged_ = false;
};
