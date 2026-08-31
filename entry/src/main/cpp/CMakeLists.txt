cmake_minimum_required(VERSION 3.5.0)
project(colorfilter)

set(CMAKE_CXX_STANDARD 17)

add_library(entry SHARED
    napi_init.cpp
    egl_core.cpp
    gl_renderer.cpp)

find_library(EGL-lib NAMES EGL)
find_library(GLES-lib NAMES GLESv3)
find_library(hilog-lib NAMES hilog_ndk.z)
find_library(nwindow-lib NAMES native_window)
find_library(nimage-lib NAMES native_image)
find_library(ace-lib NAMES ace_ndk.z)

target_link_libraries(entry PUBLIC
    ${EGL-lib}
    ${GLES-lib}
    ${hilog-lib}
    ${nwindow-lib}
    ${nimage-lib}
    ${ace-lib}
    libace_napi.z.so)
