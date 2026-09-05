# 相机渲染管线

## 模块边界

- `pages/Index.ets`：页面状态、XComponent Surface 生命周期、对焦/变焦/快门交互。
- `service/CameraService.ets`：相机枚举、Profile 选择、PhotoSession 和镜头朝向切换。
- `cpp/napi_init.cpp`：ArkTS 与 Native 的类型安全桥接、渲染线程生命周期。
- `cpp/egl_core.cpp`：EGL Display、Context 和 WindowSurface。
- `cpp/gl_renderer.cpp`：OES 纹理、旋转/镜像、等比 cover、限定色 Shader 和像素读回。
- `service/CaptureService.ets`：水印成图、JPEG、沙箱文件和照片元数据。

## 数据流

```text
Camera Kit PreviewOutput
  → OH_NativeImage Surface
  → External OES texture
  → rotation / one-time front mirror / proportional cover
  → color-isolation fragment shader
  → EGL WindowSurface / XComponent
  → glReadPixels (BGRA PixelMap)
  → ArkUI watermark snapshot
  → JPEG + RDB metadata
```

XComponentController 是显示 Surface 的唯一生命周期所有者。Surface ID 从 ArkTS
`string` 转为 `bigint`，再由 NAPI 无损解码为 `uint64_t`。由 Surface ID 创建的
OHNativeWindow 在渲染线程结束后显式释放。

## 几何规则

1. 主窗口采用透明系统栏的沉浸式布局，XComponent 显式请求铺满完整窗口的 SurfaceRect。
2. 顶部颜色/节气信息和底部不透明黑色控制区都是 Stack 浮层，不参与 XComponent 尺寸计算。
3. 只有 XComponentController 的 `onSurfaceChanged` 能下发 Native display geometry，避免 ArkUI 区域尺寸和安全区 SurfaceRect 互相覆盖。
4. Camera Profile 优先匹配旋转到竖屏后的目标宽高比，再比较像素数。
5. API 12 NativeImage V2 的完整 4×4 矩阵负责生产端旋转和平移；Shader 先在屏幕坐标执行等比 cover，再映射到纹理坐标。
6. NativeWindow 使用等比 `SCALE_CROP` 作为尺寸切换期间的安全网：比例不同时裁掉边缘，不产生留白，也不分别拉伸宽高。
7. 拍照 PixelMap 使用 framebuffer 实际宽高，水印节点使用同一宽高比。
8. 数据库记录最终水印快照尺寸和快门时生效的颜色。

## 生命周期

```text
SurfaceCreated → startRenderer → EGL/GL ready → open PhotoSession → running
SurfaceChanged → set buffer geometry → recreate EGLSurface
switch facing → stop/release old session → open opposite facing → update mirror/zoom
SurfaceDestroyed/page exit → stop camera → join render thread → release GL/EGL/window
```

初始化失败会完整复位 Native 状态；页面的“点击重试”会使用当前仍有效的 64 位
Surface ID 重新创建渲染线程。`session.start()` 只代表启动请求完成，页面必须收到
`PreviewOutput.frameStart` 才进入 `previewing` 并清除历史错误。镜头切换失败时
CameraService 会尝试恢复原朝向。

NativeImage 严格按生产者通知消费：`OH_OnFrameAvailableListener` 只递增通知序号，
EGL 线程发现新序号后才调用一次 `OH_NativeImage_UpdateSurfaceImage`。只有消费与矩阵读取
都成功时才替换缓存的纹理方向；无新帧或消费失败继续显示最后一个有效方向，避免预览内容
在横竖方向之间跳变，也避免无条件取帧造成 buffer 耗尽。

## 模拟器与日志

模拟器不保证提供真实的前后两个可用朝向。切换能力同时要求前置和后置设备都能查询到
`NORMAL_PHOTO` 的 Preview Profile；否则按钮保持禁用，点击时会显示具体缺失原因。
变焦范围和自动对焦也按可选能力处理：空/非法变焦范围降级为固定 `1x`，不支持自动对焦时
忽略点按对焦并只记录一次日志，两者都不会把有效预览切换到错误态。

一次启动或切换使用同一个 `op` 关联 ArkTS 日志：

```text
[TodayColor][CameraUI][op=3] phase cameraOpening -> previewing
[TodayColor][CameraService][op=3] preview first frame received
```

Native/EGL/GL 生命周期使用 `ColorFilter` tag，并包含启动渲染器时的 operation ID：

```text
[ColorFilter][op=3] EGL init begin
[ColorFilter][op=3] camera consumer surface ready
[ColorFilter][op=3] first GL frame surface=... buffer=... cover=...
```

DevEco Studio 的 Log 窗口可分别过滤 `TodayColor` 和 `ColorFilter`。HDC 连接正常时也可使用
有界日志查询，避免持续输出逐帧日志。

## 验证矩阵

- 香芋紫、每日色和自定义色冷启动。
- 后置→前置→后置连续切换，前置只镜像一次。
- 离开相机页再返回、Surface 尺寸变化、初始化失败后重试。
- 圆形/方格目标在预览、拍照浮层、JPEG 和图库中保持比例。
- arm64-v8a 与 x86_64 Native 编译、ArkTS 编译和 unsigned HAP 打包。
