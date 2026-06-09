# HƯỚNG DẪN CHẠY BACKTEST TRÊN MÁY MAC & WINDOWS

Dự án này đã tích hợp đầy đủ công cụ kiểm thử chiến thuật (Backtest Engine) giao dịch Vàng (XAUUSD) M1 sử dụng chỉ báo **SuperTrend** kết hợp dời lỗ tự động (Trailing Stop) và bộ lọc phiên giao dịch.

Bạn có thể chạy thử nghiệm trực tiếp thông qua Terminal trên máy Mac hoặc PowerShell trên Windows cực kỳ nhanh chóng.

---

## 🛠️ Trình Tự Thiết Lập Nhanh

### Bước 1: Tải nhanh Node.js (Nếu chưa có)
Nhấp vào một trong các liên kết dưới đây để tải về và cài đặt trực tiếp bản Node.js tối ưu cho dòng máy của bạn:
- 🍏 **Mac (Apple Silicon M1/M2/M3):** [Tải Node.js macOS (.pkg) cho M1/M2/M3](https://nodejs.org/dist/v20.11.0/node-v20.11.0-darwin-arm64.pkg)
- 💻 **Mac (Intel Chip):** [Tải Node.js macOS (.pkg) cho chip Intel](https://nodejs.org/dist/v20.11.0/node-v20.11.0-darwin-x64.pkg)
- 🪟 **Windows (64-bit):** [Tải Node.js Windows Installer (.msi)](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi)

---

### Bước 2: Chuẩn bị dữ liệu lịch sử CSV
Đảm bảo file dữ liệu lịch sử của bạn nằm đúng ở đường dẫn sau:
`/Users/giapld/Documents/TL Học Tập/drive-download-20260609T101124Z-3-001/2026.csv`

*(Hệ thống đã được thiết kế thông minh để tự động nhận diện và đọc file CSV thực tế tại đường dẫn này trên MacOS hoặc `C:\xau_data` trên Windows).*

---

### Bước 3: Cài đặt các thư viện phụ thuộc
Di chuyển vào thư mục dự án đã clone về, mở Terminal (hoặc PowerShell) lên và chạy lệnh sau để tự tạo thư mục `node_modules` và cài đặt các thư viện cần thiết (`tsx`, `typescript`, `dotenv`, v.v...):
```bash
npm install
```

---

### Bước 4: Khởi chạy Backtest toàn diện trên Terminal
Để tiến hành chạy backtest trực tiếp theo cú pháp bạn mong muốn:
```bash
npx tsx run_backtest.ts 2018-01-01 2019-01-01 1m 1.2 false
```

Các tham số được truyền lần lượt:
1. `Ngày bắt đầu` (Ví dụ: `2018-01-01`)
2. `Ngày kết thúc` (Ví dụ: `2019-01-01`)
3. `Timeframe Khung thời gian` (Ví dụ: `1m`)
4. `Risk / Reward Ratio (R:R)` (Ví dụ: `1.2`)
5. `Lọc giờ phiên giao dịch (Session Filter)` (Ví dụ: `true` hoặc `false` để tắt lọc)

---

## 🚀 Tự Động Hóa Cập Nhật & Vận Hành Bot Với 1 Click

Hệ thống đã chuẩn bị sẵn 2 kịch bản tự động tải code mới nhất từ GitHub, tự cài đặt thư viện mới, tự động build code TypeScript sang CJS dán vào PM2 để chạy nền mượt mà:

### 🪟 Đối với hệ điều hành Windows:
Chạy file PowerShell:
```powershell
./update.ps1
```

### 🍏 Đối với hệ điều hành MacOS / Linux:
Cấp quyền thực thi và chạy file Shell:
```bash
chmod +x update.sh
./update.sh
```

---

## 📅 Cấu Trúc Đầu Ra Báo Cáo
Sau khi tiến trình kết thúc, hệ thống sẽ tự động xuất các báo cáo chi tiết:
1. **Lịch sử giao dịch chi tiết:** Xuất ra file `/data/trades.json` chứa từng mốc thời gian, loại lệnh (BUY/SELL), giá vào/ra, lý do khớp lệnh (TP, SL, REVERSAL hoặc Trailing) và biến động số dư.
2. **Tổng hợp báo cáo tổng:** Lưu tại file `/data/backtest_results.json` để bạn dễ dàng lưu trữ.
