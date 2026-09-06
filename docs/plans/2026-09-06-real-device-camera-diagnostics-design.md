# 真机相机渲染诊断设计

## 背景

真机页面显示“渲染管线初始化失败”，随后点击镜头切换又提示“当前设备没有可用摄像头”。现有启动顺序是先创建 XComponent/EGL/GL/NativeImage 渲染管线，渲染器就绪后才进入 CameraManager 枚举。因此第二条提示只是渲染器提前失败后的派生状态，不能证明真机没有摄像头。

## 目标

- 用统一的 `[TodayColor]` 前缀串联 ArkUI、CameraService、NativeRenderer 与 EGL 日志。
- 把 Native 层已有但不可见的错误状态暴露给 ArkTS，使超时日志能够指出失败阶段。
- 区分“摄像头尚未枚举”和“设备确实没有可用摄像头”。
- 本轮不改变 Surface resize/EGL 重建策略，先取得真机证据。

## 方案

Native 层维护一个线程安全的渲染状态快照，包含 `stage`、`message`、`eglError`、`running`、`ready` 和当前操作编号。`startRenderer`、NativeWindow 创建、EGL 初始化、GL 初始化、NativeImage 创建、几何更新和渲染线程退出都更新该状态。

通过 N-API 新增 `getRendererStatus()`，以固定字段对象返回快照。ArkTS 在启动请求后、每次就绪轮询结束以及最终超时时记录状态。错误界面仍保持用户可读文案，技术细节只进入日志。

CameraService 增加“是否已经完成设备枚举”的状态。切换按钮在相机服务尚未启动时返回“相机管线尚未就绪”，只有 CameraManager 确实返回空数组时才返回“当前设备没有可用摄像头”。设备枚举、位置、类型、场景能力和预览 profile 数量继续使用相同操作编号记录。

## 风险控制

- 状态查询只读，不控制 Native 生命周期。
- 错误文本不包含 SurfaceId、设备标识或用户数据。
- Native 状态由互斥锁保护，避免渲染线程与 JS 线程并发读写字符串。
- 日志避免逐帧输出，只记录阶段变化、第一次失败和最终状态。

## 验证

- ArkTS/Native 编译通过。
- 模拟器启动日志能形成 `surface → nativeWindow → egl → gl → nativeImage → ready → camera enumeration` 顺序。
- 人为或真机失败时，UI 日志包含明确的 Native `stage/message/eglError`。
- 渲染器未就绪时点击切换，不再误报设备没有摄像头。
