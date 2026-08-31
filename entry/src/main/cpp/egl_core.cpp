#include "include/egl_core.h"
#include <hilog/log.h>
#include <native_window/external_window.h>

#define LOG(fmt, ...) OH_LOG_Print(LOG_APP, LOG_INFO, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) OH_LOG_Print(LOG_APP, LOG_ERROR, 0xC0DE, "ColorFilter", fmt, ##__VA_ARGS__)

bool EglCore::Init(OHNativeWindow *window)
{
    display_ = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display_ == EGL_NO_DISPLAY) {
        LOGE("eglGetDisplay failed");
        return false;
    }
    EGLint major = 0, minor = 0;
    if (!eglInitialize(display_, &major, &minor)) {
        LOGE("eglInitialize failed");
        return false;
    }
    LOG("EGL %{d}.%{d}", major, minor);

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
        LOGE("eglChooseConfig failed");
        return false;
    }

    const EGLint contextAttribs[] = { EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE };
    context_ = eglCreateContext(display_, config_, EGL_NO_CONTEXT, contextAttribs);
    if (context_ == EGL_NO_CONTEXT) {
        LOGE("eglCreateContext failed");
        return false;
    }

    eglSurface_ = eglCreateWindowSurface(display_, config_, (EGLNativeWindowType)window, nullptr);
    if (eglSurface_ == EGL_NO_SURFACE) {
        LOGE("eglCreateWindowSurface failed 0x%{public}x", eglGetError());
        return false;
    }
    return MakeCurrent();
}

bool EglCore::RecreateSurface(OHNativeWindow *window)
{
    if (display_ == EGL_NO_DISPLAY || context_ == EGL_NO_CONTEXT) {
        return false;
    }
    if (eglSurface_ != EGL_NO_SURFACE) {
        eglDestroySurface(display_, eglSurface_);
        eglSurface_ = EGL_NO_SURFACE;
    }
    eglSurface_ = eglCreateWindowSurface(display_, config_, (EGLNativeWindowType)window, nullptr);
    if (eglSurface_ == EGL_NO_SURFACE) {
        LOGE("RecreateSurface failed 0x%{public}x", eglGetError());
        return false;
    }
    return MakeCurrent();
}

bool EglCore::MakeCurrent()
{
    if (!eglMakeCurrent(display_, eglSurface_, eglSurface_, context_)) {
        LOGE("eglMakeCurrent failed 0x%{public}x", eglGetError());
        return false;
    }
    return true;
}

void EglCore::SwapBuffers()
{
    eglSwapBuffers(display_, eglSurface_);
}

void EglCore::Release()
{
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
