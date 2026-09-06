#include "include/egl_core.h"
#include <hilog/log.h>
#include <native_window/external_window.h>

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "TodayColorNative", \
    "[TodayColor][EGL] " fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "TodayColorNative", \
    "[TodayColor][EGL] " fmt, ##__VA_ARGS__)

bool EglCore::Init(OHNativeWindow *window)
{
    lastError_ = EGL_SUCCESS;
    LOG("[op=%{public}d] EGL init begin windowValid=%{public}d", operationId_, window != nullptr ? 1 : 0);
    display_ = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display_ == EGL_NO_DISPLAY) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglGetDisplay failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    EGLint major = 0, minor = 0;
    if (!eglInitialize(display_, &major, &minor)) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglInitialize failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    LOG("[op=%{public}d] EGL version %{public}d.%{public}d", operationId_, major, minor);

    const EGLint configAttribs[] = {
        EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
        EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8,
        EGL_ALPHA_SIZE, 8,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_NONE
    };
    EGLint numConfigs = 0;
    if (!eglChooseConfig(display_, configAttribs, &config_, 1, &numConfigs) || numConfigs < 1) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglChooseConfig failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }

    const EGLint contextAttribs[] = { EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE };
    context_ = eglCreateContext(display_, config_, EGL_NO_CONTEXT, contextAttribs);
    if (context_ == EGL_NO_CONTEXT) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglCreateContext failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }

    eglSurface_ = eglCreateWindowSurface(display_, config_, (EGLNativeWindowType)window, nullptr);
    if (eglSurface_ == EGL_NO_SURFACE) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglCreateWindowSurface failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    return MakeCurrent();
}

bool EglCore::RecreateSurface(OHNativeWindow *window)
{
    lastError_ = EGL_SUCCESS;
    LOG("[op=%{public}d] EGL recreate surface begin", operationId_);
    if (display_ == EGL_NO_DISPLAY || context_ == EGL_NO_CONTEXT) {
        LOGE("[op=%{public}d] EGL recreate rejected: display/context unavailable", operationId_);
        return false;
    }
    if (eglSurface_ != EGL_NO_SURFACE) {
        eglDestroySurface(display_, eglSurface_);
        eglSurface_ = EGL_NO_SURFACE;
    }
    eglSurface_ = eglCreateWindowSurface(display_, config_, (EGLNativeWindowType)window, nullptr);
    if (eglSurface_ == EGL_NO_SURFACE) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] EGL recreate failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    bool current = MakeCurrent();
    LOG("[op=%{public}d] EGL recreate completed current=%{public}d", operationId_, current ? 1 : 0);
    return current;
}

bool EglCore::MakeCurrent()
{
    if (!eglMakeCurrent(display_, eglSurface_, eglSurface_, context_)) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglMakeCurrent failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    return true;
}

bool EglCore::SwapBuffers()
{
    if (!eglSwapBuffers(display_, eglSurface_)) {
        lastError_ = eglGetError();
        LOGE("[op=%{public}d] eglSwapBuffers failed error=0x%{public}x", operationId_, lastError_);
        return false;
    }
    return true;
}

void EglCore::Release()
{
    LOG("[op=%{public}d] EGL release begin", operationId_);
    if (display_ != EGL_NO_DISPLAY) {
        eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (eglSurface_ != EGL_NO_SURFACE) {
            eglDestroySurface(display_, eglSurface_);
            eglSurface_ = EGL_NO_SURFACE;
        }
        if (context_ != EGL_NO_CONTEXT) {
            eglDestroyContext(display_, context_);
            context_ = EGL_NO_CONTEXT;
        }
        eglTerminate(display_);
        display_ = EGL_NO_DISPLAY;
    }
    LOG("[op=%{public}d] EGL release completed", operationId_);
}

int EglCore::SurfaceWidth() const
{
    EGLint w = 0;
    eglQuerySurface(display_, eglSurface_, EGL_WIDTH, &w);
    return w;
}

int EglCore::SurfaceHeight() const
{
    EGLint h = 0;
    eglQuerySurface(display_, eglSurface_, EGL_HEIGHT, &h);
    return h;
}
