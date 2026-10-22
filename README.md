# Random Power Battle ⚔️

เกมเว็บ Pixel Art สำหรับสู้กับเพื่อนแบบ real-time:
- สร้างห้องด้วยรหัส 6 ตัว และให้เพื่อนเข้าด้วยรหัส
- พลังสุ่มเปลี่ยนทุก 5 วินาที โดยเซิร์ฟเวอร์เป็นผู้กำหนด
- เดินซ้าย/ขวา กระโดด และโจมตี
- ห้องละ 2 คน
- Node.js + Express + Socket.IO

## Run locally

ต้องติดตั้ง Node.js 20 ขึ้นไป

```bash
npm install
npm start
```

เปิด http://localhost:3000 ในเบราว์เซอร์  
ทดสอบผู้เล่นสองคนได้โดยเปิดหน้าต่างปกติและ Incognito หรือใช้คอมพิวเตอร์สองเครื่องในเครือข่ายเดียวกัน (เครื่องอื่นใช้ IP ของเครื่องที่รันเซิร์ฟเวอร์)

## Put this project on GitHub

1. สร้าง repository ใหม่ที่ https://github.com/new ชื่อ `random-power-battle`
2. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดใน ZIP นี้ (อย่าอัปโหลด `node_modules`)
3. Commit changes

## Publish online

GitHub เก็บโค้ด ส่วนเกม multiplayer ต้องรันบน Node.js host ที่รองรับ WebSocket เช่น Render:
1. สร้าง Web Service จาก GitHub repository
2. Build command: `npm install`
3. Start command: `npm start`
4. ใช้ URL ที่บริการให้มาเพื่อเข้าเกม

อย่าเผยแพร่ secret keys ใน repository นี้ ไม่มี secret keys ที่จำเป็นในเวอร์ชันเริ่มต้น

## Current scope

Prototype multiplayer foundation. Room creation, room join, movement, attacks, HP, and power rotation are server-authoritative. It is a starting point and still needs broader testing, better animations, mobile touch controls, and production hardening before public release.
