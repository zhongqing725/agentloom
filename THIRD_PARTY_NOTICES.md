# Third-Party Notices

本仓库包含以下第三方组件或基于其改写的实现。它们各自遵循原许可证；本项目仅作为 AgentLoom 应用的一部分使用，不单独分发、再许可或销售。

## React Bits

- 上游：<https://github.com/DavidHDev/react-bits>
- Copyright (c) 2026 David Haz
- 许可证：**MIT + Commons Clause License Condition v1.0**

本仓库中基于 React Bits 改写、用于 AgentLoom 界面的组件：

- `src/web/components/Antigravity.tsx` / `Antigravity.css`
- `src/web/components/DriftWall.jsx` / `DriftWall.css`
- `src/web/components/GlassIcons.jsx` / `GlassIcons.css`
- `src/web/components/GooeyNav.jsx` / `GooeyNav.css`
- `src/web/components/OrbitImages.jsx` / `OrbitImages.css`
- `src/web/components/TextPressure.jsx`

改动：主题 token、尺寸、交互默认值与 React/Vite 运行时的接入方式；组件概念与公开 API 仍基于 React Bits。这些文件不单独作为组件库、模板或 UI Kit 分发或销售。

### 许可证文本

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, and distribute the Software as part of an application, website, or product, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

#### Commons Clause Restriction

You may use this Software, including for any commercial purpose, so long as you do not sell, sublicense, or redistribute the components themselves—whether alone, in a bundle, or as a ported version.

What you make with the tools is yours to use. You may not sell or redistribute the exports on their own, either individually or as the product itself.

#### No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

## BoardUI

- 上游：<https://www.boardui.com>
- 用途：`src/components/`、`src/styles/` 下的 BoardUI 源组件与设计 token（免费组件）。
- 组件源码按 BoardUI 的使用条款随项目引入；本项目未将其作为独立组件库分发。

## Remix Icon

- 上游：<https://github.com/Remix-Design/RemixIcon>
- 许可证：Apache License 2.0
- 用途：界面图标（`@remixicon/react`）。

## 其他依赖

React、Vite、Fastify、React Flow、unpdf 等 npm 依赖遵循各自 LICENSE，见 `pnpm-lock.yaml` 与各包内的许可文件。
