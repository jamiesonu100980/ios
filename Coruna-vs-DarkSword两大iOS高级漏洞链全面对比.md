# Coruna vs DarkSword：两大 iOS 高级漏洞链全面对比——从 WebKit 入口到 Kernel 控制的现代 iPhone Exploit Chain 演进

**说明**：Coruna 与 DarkSword 并不是单一漏洞，而是完整的 iOS Exploit Kit（漏洞利用框架）。公开分析显示，两者都属于“浏览器入口 → 沙箱突破 → 权限提升 → 系统级控制”的高级攻击链，但设计理念和技术路线存在明显差异。

---

## 一、总体对比

| 项目 | Coruna | DarkSword |
| --- | --- | --- |
| 类型 | iOS 全链漏洞利用框架 | iOS 全链漏洞利用框架 |
| 主要目标 | 长期隐蔽控制、数据窃取 | 快速设备攻陷、监控植入 |
| 影响系统 | 主要针对 iOS 13～17 系列 | 主要针对 iOS 18.4～18.7 |
| 漏洞数量 | 约23个漏洞组件、多个攻击链 | 约6个漏洞组成完整链 |
| 入口 | WebKit/浏览器水坑攻击 | WebKit/Safari入口 |
| 核心突破 | Kernel + PAC/PPL/SPTM绕过 | WebKit → Sandbox → Kernel |
| 复杂度 | 极高 | 高 |
| 代码形态 | 多阶段组件化框架 | 大量JavaScript实现 |

---

## 二、攻击链结构比较

### Coruna攻击链

整体更像“工业化攻击平台”：

```text
恶意网站
    |
    ↓
WebKit Exploit
    |
    ↓
Sandbox Escape
    |
    ↓
Kernel Exploit
    |
    ↓
PAC绕过
    |
    ↓
PPL绕过
    |
    ↓
SPTM绕过
    |
    ↓
系统进程注入
    |
    ↓
Payload
```

Coruna最大的特点：

不只是获得 Kernel 权限，而是尝试突破苹果最新一代内核防护机制。

### DarkSword攻击链

DarkSword更偏向现代Web攻击链：

```text
恶意网页
    |
    ↓
JavaScriptCore漏洞
    |
    ↓
WebKit RCE
    |
    ↓
GPU Sandbox Escape
    |
    ↓
XNU Kernel Exploit
    |
    ↓
权限提升
    |
    ↓
Payload加载
```

Google Threat Intelligence 的分析显示，DarkSword使用多个漏洞组合实现完整设备攻陷，包括 JavaScriptCore、dyld PAC绕过、ANGLE以及XNU相关漏洞。

---

## 三、入口层比较：WebKit攻击

### Coruna

特点：

* 针对多个iOS版本
* 拥有多个备用攻击链
* 适应不同设备环境

攻击逻辑：

```text
Safari
 |
WebKit
 |
JavaScript执行
 |
浏览器进程控制
```

### DarkSword

更强调：

* JavaScript驱动
* WebKit自动化利用
* 水坑网站投放

特点：

攻击者只需要诱导目标访问特定网站：

```text
目标访问网页
  ↓
自动触发漏洞
  ↓
无需安装App
```

---

## 四、Kernel Exploit比较（核心差异）

### Coruna：更偏“突破苹果防线”

Coruna的高级程度主要体现在：

#### 1. Kernel控制

目标：

```text
用户空间
  ↓
Kernel空间
  ↓
最高权限
```

#### 2. 安全机制绕过

涉及：

**PAC**

Pointer Authentication Code

作用：

防止：

* 指针篡改
* 控制流劫持

**PPL**

Page Protection Layer

保护：

* 内核关键区域
* 系统完整性

**SPTM**

Secure Page Table Monitor

保护：

* 页表
* 内存隔离

Coruna被公开分析认为包含针对这些保护机制的突破能力。

---

## 五、DarkSword Kernel设计特点

DarkSword的Kernel阶段更加现代化。

主要目标：

```text
获得Kernel Read/Write能力
  ↓
执行后续权限提升
  ↓
加载最终Payload
```

公开分析指出，DarkSword包含XNU相关漏洞，用于从浏览器沙箱进一步突破到更高权限环境。

---

## 六、代码与工程设计差异

### Coruna

更像：

商业级漏洞武器平台

特点：

* 模块化
* 多版本适配
* 多链备用
* 复杂检测逻辑

类似：

```text
Exploit Framework
├── iOS版本判断
├── 漏洞选择
├── Kernel模块
├── 绕过模块
└── Payload模块
```

### DarkSword

更像：

高度自动化Web Exploit平台

特点：

* JavaScript驱动
* 快速部署
* 适合水坑攻击

公开报告指出，DarkSword大量阶段采用JavaScript实现。

---

## 七、隐蔽性比较

### Coruna

偏向：

长期驻留

技术方向：

* 注入合法系统进程
* 隐藏自身行为
* 避免明显文件存在

### DarkSword

偏向：

快速感染

流程：

```text
访问网页
  ↓
漏洞利用
  ↓
Payload执行
  ↓
数据收集
```

---

## 八、攻击目标差异

### Coruna

更符合：

* 高价值目标
* 定向攻击
* 长期监控

### DarkSword

表现出：

* 商业间谍软件扩散
* 多攻击者采用
* 更广泛部署趋势

---

## 九、技术水平排名（研究视角）

如果按复杂度：

```text
普通iOS漏洞
        ↓
WebKit RCE
        ↓
Sandbox Escape
        ↓
Kernel Exploit
        ↓
PAC绕过
        ↓
PPL/SPTM绕过
        ↓
完整Exploit Chain
```

大致：

| 等级 | 代表 |
| --- | --- |
| ★★★ | 单WebKit漏洞 |
| ★★★★ | WebKit + Sandbox |
| ★★★★★ | Kernel Exploit |
| ★★★★★★ | Coruna级别 |
| ★★★★★☆ | DarkSword级别 |

---

## 十、两者代表的时代变化

过去：

寻找一个漏洞：

```text
Bug
 ↓
Exploit
 ↓
越狱
```

现在：

构建攻击系统：

```text
入口漏洞
  +
权限突破
  +
Kernel控制
  +
安全机制绕过
  +
隐蔽植入
  =
完整攻击平台
```

---

## 十一、最终总结

一句话：

**Coruna代表“突破苹果完整安全体系”的传统顶级Exploit Chain；DarkSword代表“现代Web化、快速传播型iOS攻击链”。**

核心区别：

```text
Coruna
=
更复杂
+
更多漏洞
+
更强安全绕过能力

DarkSword
=
更现代
+
更自动化
+
更容易扩散
```

两者共同说明：

iOS安全竞争已经从“漏洞发现”进入**“漏洞链工程化时代”**。

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
