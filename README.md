# HƯỚNG DẪN CHẠY BACKTEST TRÊN MÁY MAC (MACOS)

Dự án này đã tích hợp đầy đủ công cụ kiểm thử chiến thuật (Backtest Engine) giao dịch Vàng (XAUUSD) M1 sử dụng chỉ báo **SuperTrend** kết hợp dời lỗ tự động (Trailing Stop) và bộ lọc phiên giao dịch.

Bạn có thể chạy thử nghiệm trực tiếp thông qua Terminal trên máy Mac cực kỳ nhanh chóng bằng cách thực hiện tuần tự các bước dưới đây.

---

## 🛠️ Trình Tự Thiết Lập Trên Mac

### Bước 1: Chuẩn bị dữ liệu lịch sử CSV
Đảm bảo file dữ liệu lịch sử của bạn nằm đúng ở đường dẫn sau:
`/Users/giapld/Documents/TL Học Tập/drive-download-20260609T101124Z-3-001/2026.csv`

*(Hệ thống đã được thiết kế thông minh để tự động nhận diện và đọc file CSV thực tế tại đường dẫn này trên MacOS).*

---

### Bước 2: Cài đặt NodeJS (nếu chưa có)
Nếu máy Mac của bạn chưa cài đặt NodeJS, bạn hãy chạy lệnh dưới đây thông qua [Homebrew](https://brew.sh/):
```bash
brew install node
```
*Hoặc tải bản cài đặt trực tiếp (.pkg) từ trang chủ: [nodejs.org](https://nodejs.org/)*

---

### Bước 3: Cài đặt các thư viện phụ thuộc
Di chuyển vào thư mục dự án đã clone về, mở Terminal lên và chạy lệnh sau để tự tạo thư mục `node_modules` và cài đặt các thư viện cần thiết (`tsx`, `typescript`, `dotenv`, v.v...):
```bash
npm install
```

---

### Bước 4: Khởi chạy Backtest toàn diện trên Terminal
Để tiến hành chạy backtest trực tiếp và nhận bảng thống kê chi tiết báo cáo lãi lỗ từng lệnh, thời gian rút vốn tối đa (Max Drawdown) trực tiếp trên Terminal MacOS, bạn chỉ cần gõ lệnh siêu ngắn:
```bash
npm run backtest
```

### 💡 Tham số tùy chỉnh nâng cao qua dòng lệnh:
Bạn có thể tùy ý sửa ngày bắt đầu, ngày kết thúc, chu kỳ, hệ số chỉ báo và lot size trực tiếp khi gõ lệnh:
```bash
npx tsx run_backtest.ts [Ngày_Bắt_Đầu] [Ngày_Kết_Thúc] [Chu_Kỳ_ATR] [Hệ_Số_Multiplier] [Khối_Lượng_Lot]
```

*Ví dụ chạy backtest từ năm 2024 đến năm 2026 với SuperTrend (10, 3.0) và lot size 0.05:*
```bash
npx tsx run_backtest.ts 2024-01-01 2026-06-09 10 3.0 0.05
```

---

## 📅 Cấu Trúc Đầu Ra Báo Cáo
Sau khi tiến trình kết thúc, hệ thống sẽ tự động xuất các báo cáo chi tiết:
1. **Lịch sử giao dịch chi tiết:** Xuất ra file `/data/trades.json` chứa từng mốc thời gian, loại lệnh (BUY/SELL), giá vào/ra, lý do khớp lệnh (TP, SL, REVERSAL hoặc Trailing) và biến động số dư.
2. **Tổng hợp báo cáo tổng:** Lưu tại file `/data/backtest_results.json` để bạn dễ dàng lưu trữ.
