#pragma once
#include <cstdint>
#include <EGL/egl.h>
#include <native_window/external_window.h>

/**
 * EGL 环境封装：Display / Config / Context / WindowSurface。
 * 所有 GL 调用必须在持有 context 的渲染线程上进行。
 */
class EglCore {
public:
    void SetOperationId(int32_t operationId) { operationId_ = operationId; }
    bool Init(OHNativeWindow *window);
    void Release();
    bool MakeCurrent();
    bool SwapBuffers();
    /** 尺寸变化后销毁并重建 WindowSurface（buffer 几何不会自动跟随组件 resize） */
    bool RecreateSurface(OHNativeWindow *window);
    EGLSurface Surface() const { return eglSurface_; }
    int SurfaceWidth() const;
    int SurfaceHeight() const;

private:
    EGLDisplay display_ = EGL_NO_DISPLAY;
    EGLContext context_ = EGL_NO_CONTEXT;
    EGLSurface eglSurface_ = EGL_NO_SURFACE;
    EGLConfig config_ = nullptr;
    int32_t operationId_ = 0;
};
