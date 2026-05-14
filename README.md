# 🐉 華夏風雲錄 — 歷史卡牌對決

> 千古英雄 · 全球對決 | A browser-based historical card battle game

[![GitHub Pages](https://img.shields.io/badge/Play%20Online-GitHub%20Pages-brightgreen)](https://s133101.github.io/ChroniclesofChineseHistory1/)

---

## 🎮 遊戲簡介

《華夏風雲錄》是一款以中國歷史為主題的瀏覽器卡牌對戰遊戲。玩家選擇歷朝君主，搭配各代名將、謀臣、後勤官員，與 AI 或真人對決，重現從商周到清末的歷史風雲。

- **純前端** — HTML5 + CSS3 + Vanilla JavaScript，無需後端
- **P2P 連線** — 使用 PeerJS WebRTC 實現真人對戰
- **Web Audio** — 原生合成音效，無需外部音效包
- **豐富技能** — 60+ 張角色牌，每張皆有獨特技能實作

---

## 🃏 遊戲特色

| 功能 | 說明 |
|------|------|
| 👑 18 位君主 | 商湯至乾隆，各有獨特鎖定技或被動技 |
| ⚔ 將軍系統 | 大將軍 + 將軍，主將區 5 格戰場 |
| 📜 計策卡 | 突擊、固守、草船借箭、釜底抽薪等 |
| 🤖 AI 對手 | 具備優先度策略的 AI 對戰 |
| 🌐 連線對戰 | PeerJS P2P 房間碼配對 |
| 💰 收集系統 | 招募、銀兩、連勝榜 |
| 💬 即時聊天 | 全域 / 房間 / 好友私聊 |

---

## 🚀 快速開始

### 線上遊玩
直接開啟 GitHub Pages 連結即可，無需安裝任何東西。

### 本地運行
```bash
# 方法一：使用 Python
python -m http.server 8080

# 方法二：使用 Node.js
npx serve .

# 方法三：直接用 VS Code Live Server 擴充功能
```
然後打開 `http://localhost:8080`

> ⚠️ 必須透過 HTTP 伺服器開啟，直接雙擊 index.html 可能導致部分功能異常。

---

## 📁 專案結構

```
huaxia-card-game/
├── index.html          # 主頁面（所有 UI 元件）
├── styles.css          # 全域樣式
├── cards.js            # 卡牌資料庫（60+ 張）
├── game.js             # 核心遊戲邏輯（技能引擎）
├── lobby.js            # 大廳、多人配對、收集系統
├── network.js          # PeerJS 網路封裝層
└── assets/
    ├── monarchs/       # 君主圖片 (m01-m18)
    ├── generals/       # 大將軍圖片 (c01-c17)
    ├── tacticians/     # 軍師圖片 (t01-t14)
    ├── logistics/      # 後勤圖片 (s01-s09)
    ├── internal/       # 內政圖片 (n01-n12)
    └── supervision/    # 監察圖片 (j01-j05)
```

---

## 🎴 卡牌系統

### 角色類型
- **君王** — 主公，HP 5，陣亡即輸
- **大將軍** — 前排主力，HP 4
- **將軍** — 前排突擊，HP 4
- **軍師** — 後排謀略，HP 3
- **後勤** — 後排支援，HP 3
- **內政** — 後排加成，HP 3
- **監察** — 後排控制，HP 3

### 計策牌
| 卡名 | 效果 |
|------|------|
| 突擊 (殺) | 對目標造成 1 點傷害 |
| 固守 (閃) | 閃避一次突擊 |
| 休整 (桃) | 恢復目標 1 HP |
| 草船借箭 | 抽 2 張牌 |
| 釜底抽薪 | 摧毀對手後營一個角色 |
| 空城計 | 響應型：作廢一次突擊 |

---

## 🛠 技術棧

- **前端**: Vanilla HTML5 / CSS3 / ES6+ JavaScript
- **網路**: [PeerJS 1.4.7](https://peerjs.com/) (WebRTC P2P)
- **字型**: Google Fonts (Noto Serif TC, Cinzel)
- **音效**: Web Audio API 合成音效
- **儲存**: localStorage（收集、銀兩、連勝紀錄）

---

## 📜 授權

本專案僅供學習與個人使用。歷史圖像素材請確保符合原始授權規範。

---

*華夏數千年，盡在一牌之中。*
