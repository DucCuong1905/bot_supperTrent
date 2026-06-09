import fs from 'fs';
import path from 'path';
import { runBacktest } from "./src/backtester.ts";
import dotenv from "dotenv";

dotenv.config();

// Script khởi chạy backtest toàn diện và in kết quả thống kê
async function main() {
  console.log("=============================================================");
  console.log("🚀 SCRIPT KHỞI CHẠY BACKTEST TOÀN DIỆN VÀNG TRÊN TERMINAL");
  console.log("=============================================================");

  const args = process.argv.slice(2);
  
  // Thiết lập mặc định
  let startDate = "2018-01-01T00:00:00Z";
  let endDate = "2026-01-01T00:00:00Z";
  let timeframe = "1m";
  let rr = 1.2;
  let enableSessionFilter = true;
  let adxThreshold = 20;

  // Xử lý tham số truyền từ câu lệnh: npx tsx run_backtest.ts 2018-01-01 2019-01-01 1m 1.2 false
  if (args[0]) {
    startDate = args[0].includes("T") ? args[0] : `${args[0]}T00:00:00Z`;
  }
  if (args[1]) {
    endDate = args[1].includes("T") ? args[1] : `${args[1]}T00:00:00Z`;
  }
  if (args[2]) {
    timeframe = args[2];
  }
  if (args[3]) {
    rr = parseFloat(args[3]) || 1.2;
  }
  if (args[4] !== undefined) {
    enableSessionFilter = args[4] === "true";
  }

  console.log(`📌 THÔNG SỐ BACKTEST THEO CẤU HÌNH CỦA BẠN:`);
  console.log(`📅 Từ ngày          :  ${startDate}`);
  console.log(`📅 Đến ngày         :  ${endDate}`);
  console.log(`⏱️ Khung thời gian   :  ${timeframe}`);
  console.log(`⚖️ Tỷ lệ Risk Reward:  ${rr}`);
  console.log(`🌐 Lọc giờ phiên    :  ${enableSessionFilter ? "BẬT (08:00 - 21:00 UTC)" : "TỬ (00:00 - 24:00 UTC)"}`);
  console.log(`📊 ADX Threshold    :  ${adxThreshold}`);
  console.log("-------------------------------------------------------------");
  console.log("📡 Đang tiến hành phân tích CSV và chạy chiến thuật Vàng...");

  try {
    const results = await runBacktest(
      startDate,
      endDate,
      rr,
      timeframe,
      enableSessionFilter,
      20, // VWMA Period mặc định
      (progress: number) => {}, // Callback không in log phần trăm để terminal sạch gọn
      adxThreshold,
      true // Bật log chi tiết lệnh
    );

    // Đọc file trades.json vừa xuất ra để tính toán chi tiết như script thống kê của bạn
    const TRADES_FILE = path.join(process.cwd(), 'data', 'trades.json');

    if (fs.existsSync(TRADES_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'));
        
        if (Array.isArray(data) && data.length > 0) {
          const monthlyStats: Record<string, { wins: number; losses: number; pnl: number }> = {};
          let totalWins = 0;
          let totalLosses = 0;
          let totalPnl = 0;

          const sortedHistory = [...data]
            .filter((t: any) => t.time && t.status)
            .sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

          let maxConsecLosses = 0;
          let currentConsecLosses = 0;
          let peakBal = sortedHistory[0]?.balanceBefore !== undefined ? sortedHistory[0].balanceBefore : 5000;
          let currentBal = peakBal;
          let maxDDVal = 0;
          let maxDDPct = 0;

          for (const trade of sortedHistory) {
            const date = new Date(trade.time);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyStats[monthKey]) {
              monthlyStats[monthKey] = { wins: 0, losses: 0, pnl: 0 };
            }

            const pnl = parseFloat(trade.pnl) || 0;
            monthlyStats[monthKey].pnl += pnl;
            totalPnl += pnl;

            if (trade.status === 'WIN') {
              monthlyStats[monthKey].wins++;
              totalWins++;
              currentConsecLosses = 0;
            } else {
              monthlyStats[monthKey].losses++;
              totalLosses++;
              currentConsecLosses++;
              if (currentConsecLosses > maxConsecLosses) {
                maxConsecLosses = currentConsecLosses;
              }
            }

            const bBefore = trade.balanceBefore !== undefined ? trade.balanceBefore : currentBal;
            const bAfter = trade.balanceAfter !== undefined ? trade.balanceAfter : (bBefore + pnl);
            currentBal = bAfter;

            if (currentBal > peakBal) {
              peakBal = currentBal;
            } else {
              const ddVal = peakBal - currentBal;
              const ddPct = (ddVal / peakBal) * 100;
              if (ddVal > maxDDVal) {
                maxDDVal = ddVal;
              }
              if (ddPct > maxDDPct) {
                maxDDPct = ddPct;
              }
            }
          }

          console.log("\n================ KẾT QUẢ GIAO DỊCH THEO THÁNG ================\n");

          const sortedMonths = Object.keys(monthlyStats).sort((a, b) => b.localeCompare(a)); // Tháng mới nhất trước

          for (const month of sortedMonths) {
            const stats = monthlyStats[month];
            const total = stats.wins + stats.losses;
            const winrate = total > 0 ? (stats.wins / total) * 100 : 0;

            console.log(`📅 Tháng: ${month}`);
            console.log(`   - Tổng lệnh: ${total}`);
            console.log(`   - Thắng: ${stats.wins} | Thua: ${stats.losses}`);
            console.log(`   - Winrate: ${winrate.toFixed(1)}%`);
            console.log(`   - PnL (Lợi nhuận): $${stats.pnl.toFixed(2)}`);
            console.log(`--------------------------------------------------------------`);
          }

          const grandTotal = totalWins + totalLosses;
          const grandWinrate = grandTotal > 0 ? (totalWins / grandTotal) * 100 : 0;

          console.log(`\n================ TỔNG KẾT TOÀN THỜI GIAN ====================\n`);
          console.log(`🟢 Tổng số lệnh : ${grandTotal}`);
          console.log(`🏆 Tỷ lệ thắng  : ${grandWinrate.toFixed(1)}%`);
          console.log(`💰 Tổng PnL ($) : $${totalPnl.toFixed(2)}`);
          console.log(`💵 Số dư đầu    : $5,000.00`);
          console.log(`💵 Số dư cuối   : $${results.finalBalance.toFixed(2)}`);
          console.log(`📉 Sụt giảm tài sản lớn nhất (Max Drawdown)    : $${maxDDVal.toFixed(2)} (${maxDDPct.toFixed(2)}%)`);
          console.log(`🔥 Chuỗi thua liên tiếp tối đa (Max Losses Seq) : ${maxConsecLosses} lệnh liên tiếp`);
          console.log(`\n==============================================================\n`);
        } else {
          console.log("⚠️ Không phát sinh giao dịch nào trong khoảng thời gian phân tích.");
        }
      } catch (err: any) {
        console.error("Lỗi khi đọc file giao dịch:", err.message);
      }
    }

  } catch (error: any) {
    console.error("\n❌ Đã xảy ra lỗi nghiêm trọng khi chạy backtest:", error.message);
  }
}

main();
