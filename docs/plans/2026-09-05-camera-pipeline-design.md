# 相机渲染管线稳定性设计

## 背景

应用以 ArkUI `XComponent` 作为显示 Surface，由 Camera Kit 把预览帧写入
`OH_NativeImage`，Native OpenGL ES 读取 OES 纹理、执行限定色滤镜，再绘制到
XComponent。拍照时从当前 GL framebuffer 读回 BGRA 像素，经 ArkUI 水印层合成后
编码为 JPEG。

当前故障包括渲染管线偶发初始化失败、无法可靠切换前置镜头、前置预览不镜像，以及
照片纵向拉伸。香芋紫仅是故障出现时的活动配色；颜色 uniform 不参与 EGL、Surface 或
Camera Session 初始化，因此不是初始化失败的因果来源。

## 第一性原理

1. 一个 Surface 只能有一个明确的生命周期所有者。
2. Surface ID 是 64 位标识，跨 ArkTS/NAPI/C++ 边界不得降为 32 位。
3. 相机切换的业务语义是“切换朝向”，而不是“移动设备数组下标”。
4. 预览、GL framebuffer、PixelMap 和截图节点必须共享同一宽高比真值。
5. 跨线程共享的渲染参数必须同步；失败路径必须回收资源并允许重试。

## 方案

### Surface 与渲染生命周期

使用自定义 `XComponentController` 的 `onSurfaceCreated`、`onSurfaceChanged`、
`onSurfaceDestroyed` 作为唯一生命周期入口，并移除 XComponent 的 `libraryname` 参数。
Controller 将字符串 Surface ID 转为 `bigint` 传给 NAPI；Native 使用
`napi_get_value_bigint_uint64` 解码，再通过
`OH_NativeWindow_CreateNativeWindowFromSurfaceId` 创建目标窗口。

Native 渲染状态显式区分 stopped、starting、running、failed。任意 EGL/GL 初始化失败
都在退出线程前释放已创建资源、清空 window/state，并通知 ArkTS。重新收到有效 Surface
后可以再次启动。Surface 尺寸变化只更新 buffer geometry，并在渲染线程内重建
EGLSurface，避免 UI 线程接触 EGL。

### 相机会话与镜头切换

CameraService 建立可用朝向列表，默认选择后置；切换时明确寻找与当前朝向相反的设备，
避免多后摄设备造成“点击后仍是后置”。相机会话停止、释放、输出释放和输入关闭均独立
容错，确保前一步失败不会阻止后续资源回收。

Profile 选择首先最小化“旋转到竖屏后的宽高比”与目标取景框比例的差值，其次在合理
像素预算内选择较高分辨率。切换失败时保留目标 Surface，重新尝试恢复原朝向；UI 只在
切换成功后更新镜像和变焦范围。

镜像只在 Fragment Shader 的纹理坐标阶段执行一次，避免 Vertex/Fragment 两次翻转相互
抵消。

### 几何与拍照

ArkUI 在 XComponent 首次有效面积变化时记录真实像素宽高，并把该尺寸同时下发给 Native
buffer geometry。渲染器根据系统完整纹理变换矩阵映射纹理坐标，再根据旋转后的有效
buffer 比例执行居中 `cover` 裁切，不使用 NativeWindow 的非等比拉伸来修正内容比例。

拍照返回 framebuffer 的实际宽高。预览浮层不再写死独立的 9:16 假设，而使用捕获结果
的 `width / height`；`ImageFit.Cover` 只负责等比裁剪。数据库保存最终 JPEG 的逻辑尺寸，
并记录拍摄时实际生效的颜色，而不是每日默认色。

### 并发与错误处理

颜色、镜像、buffer 尺寸和 Surface 尺寸通过互斥锁保护的参数快照在每帧开始时读取。
捕获请求保留条件变量，但在渲染停止或失败时主动取消并唤醒等待者，避免 UI 线程等待到
超时。

ArkTS 使用一次性启动 Promise 防止重复启动；失败后清除启动状态并提供点击重试。切换、
拍照和页面退出互斥，防止相机会话释放过程中继续捕获。

## 兼容性边界

- 保持 HarmonyOS API 12 兼容，不引入新三方依赖。
- 保留现有实时 GL 限定色滤镜、水印、图库和系统相册保存流程。
- 相机输出仍采用现有 PreviewOutput 管线，不在本次加入独立 PhotoOutput。
- 不重构与相机无关的页面和数据模型。

## 验证

1. 静态验证 Surface ID 全链路为 `bigint/uint64_t`，没有 `uint32_t` 截断。
2. 构建 arm64-v8a 与 x86_64 Native 库并完成 ArkTS/HAP 构建。
3. 验证后置启动、连续前后置切换、切换失败恢复、页面退出再进入。
4. 使用直线或圆形目标验证预览与成片不发生非等比拉伸。
5. 验证前置预览仅镜像一次，后置不镜像。
6. 验证预设香芋紫、自定义色和每日色均能初始化、拍摄并写入正确元数据。
7. 无真机时明确区分“构建/静态验证通过”和“仍需真机确认”的范围。
