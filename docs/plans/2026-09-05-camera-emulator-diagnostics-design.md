# 相机全屏预览与模拟器诊断设计

## 背景与现象

模拟器已经能够显示摄像内容，但页面仍保留“相机初始化失败，点击重试”；有效画面呈方形，顶部存在黑区；切换镜头失败。

这些现象属于三条独立链路：

1. 页面用 `starting` 与 `camError` 两个松散变量推导状态，成功路径没有统一清理历史错误。
2. XComponent 固定为 `9:16` 且外层保留顶部 padding，没有真正占满相机页面；相机 Profile 与显示 Surface 的比例也可能不同。
3. 模拟器可能只提供一个逻辑朝向，或枚举了前置相机但不支持可用的普通拍照 Profile。当前实现缺少足够日志区分能力缺失与运行错误。

## 目标

- 取景内容像系统相机一样铺满整个页面，按比例居中裁剪，不变形、不留布局黑区。
- 预览首帧出现后，页面状态必然进入成功态并清除历史错误。
- 镜头切换严格依据设备能力；不支持时给出准确反馈，失败时恢复原镜头。
- ArkTS、NAPI、EGL 和 OpenGL 的关键节点具有可关联、低噪声日志。

## 方案选择

采用“显式状态机 + 全屏 cover”。不使用模拟器专用的伪前置镜头，也不把 `session.start()` 返回当作预览成功的唯一证据。

## 页面状态模型

页面维护单一相机阶段：

```text
idle -> rendererStarting -> cameraOpening -> previewing
                                  |             |
                                  v             v
                                error        switching
                                                  |
                                      previewing / error+recovery
```

错误消息是阶段的附属信息。每轮启动和切换生成单调递增的 operation ID；异步回调只有在 ID 仍为当前操作且页面仍活跃时才能更新 UI，避免旧任务覆盖新状态。

CameraService 以 `PreviewOutput.on('frameStart')` 作为首帧证据并通知页面。`session.start()` 成功只表示请求已提交，不能独立清除加载态。

## 全屏几何

- XComponent 宽高均为 `100%`，移除固定 `aspectRatio(9 / 16)` 和顶部 padding。
- XComponent 的真实像素尺寸继续同步给 EGL buffer geometry。
- Profile 选择以全屏 Surface 旋转后的目标比例为第一优先级。
- NativeImage 变换矩阵负责旋转，Shader 用统一的 cover 计算按比例裁剪。
- 顶部色卡、九宫格、对焦环和底部控制条作为同一个 Stack 的覆盖层，不参与预览尺寸计算。

## 模拟器镜头能力

CameraService 枚举每个设备的 position、type、支持 SceneMode 和普通拍照预览 Profile 数量。切换按钮只在前后两个朝向都具有可用 `NORMAL_PHOTO` Preview Profile 时启用。

若模拟器只有一个可用朝向，页面提示“当前设备/模拟器不支持前置摄像头”。若目标相机打开失败，释放半初始化资源并恢复原镜头；恢复成功后返回预览态，同时显示一次 Toast。

## 日志设计

统一前缀：

```text
[TodayColor][CameraUI][op=12]
[TodayColor][CameraService][op=12]
[ColorFilter][op=12]
```

记录以下低频事件：

- 页面状态迁移、重试原因、过期异步结果丢弃。
- Surface 创建/变化/销毁、Surface 尺寸、Renderer 请求和 ready 超时。
- 相机设备数、位置、类型、支持场景、Profile 候选摘要和选中结果。
- CameraInput、PreviewOutput、PhotoSession 创建/配置/启动/停止/释放。
- `frameStart`、`frameEnd`、Preview/Session error。
- EGL 初始化、Surface 重建、GL Program、NativeImage consumer Surface、首个渲染帧和退出原因。

不记录逐帧日志，不输出敏感设备标识全文。

## 验证

- ArkTS、arm64-v8a、x86_64 和 unsigned HAP 构建通过。
- 静态检查确认 XComponent 不再固定比例或保留顶部 padding。
- 模拟器连接可用时，验证冷启动进入 `previewing`、错误浮层消失、全屏无布局黑区。
- 分别验证单摄像头模拟器的禁用提示，以及具备前后摄像头设备上的双向切换和失败恢复。
- 验证圆形目标在预览和拍照结果中保持圆形。

