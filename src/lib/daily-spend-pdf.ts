import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { DailySpendExportModel } from "@/lib/daily-spend-export";

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function fontPath(): string {
  return path.join(process.cwd(), "assets", "fonts", "NotoSansJP-Regular.otf");
}

/**
 * 法的機関提出向けの月次支出明細書（A4・日本語）。
 */
export async function dailySpendToPdf(
  model: DailySpendExportModel,
): Promise<Buffer> {
  const font = fontPath();
  if (!fs.existsSync(font)) {
    throw new Error(
      "日本語フォントが見つかりません（assets/fonts/NotoSansJP-Regular.otf）",
    );
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `日常生活費支出明細書（${model.label}）`,
        Author: "TECHOox",
        Subject: "日常生活費の月次支出記録",
        Creator: "TECHOox",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Noto", font);
    doc.font("Noto");

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    const ensureSpace = (need: number) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (y + need > bottom) {
        doc.addPage();
        doc.font("Noto");
        y = doc.page.margins.top;
      }
    };

    const line = (text: string, size = 10) => {
      ensureSpace(size + 8);
      doc.fontSize(size).fillColor("#111111").text(text, {
        width: pageWidth,
      });
      y = doc.y;
    };

    // Header
    doc.fontSize(16).text("日常生活費支出明細書", {
      align: "center",
      width: pageWidth,
    });
    y = doc.y + 8;
    doc
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.margins.left + pageWidth, y)
      .strokeColor("#333333")
      .lineWidth(1)
      .stroke();
    y += 16;
    doc.y = y;

    line(`対象期間: ${model.start.replace(/-/g, "/")} 〜 ${model.end.replace(/-/g, "/")}`);
    line(`対象年月: ${model.label}`);
    line(`作成日: ${model.generatedAt.replace(/-/g, "/")}`);
    line("作成方法: 家計管理アプリ TECHOox（テチョクス）に記録された日常生活費の集計");
    y += 8;
    doc.y = y;

    line("1. 集計概要", 12);
    y += 4;
    doc.y = y;

    // Summary table header
    const colX = [
      doc.page.margins.left,
      doc.page.margins.left + 120,
      doc.page.margins.left + 210,
      doc.page.margins.left + 300,
      doc.page.margins.left + 390,
    ];
    const drawSummaryHeader = () => {
      ensureSpace(22);
      doc.fontSize(9).fillColor("#111111");
      doc.text("用途", colX[0], y, { width: 110 });
      doc.text("月予算", colX[1], y, { width: 80, align: "right" });
      doc.text("支出合計", colX[2], y, { width: 80, align: "right" });
      doc.text("残額", colX[3], y, { width: 80, align: "right" });
      doc.text("備考", colX[4], y, { width: pageWidth - 390 });
      y += 14;
      doc
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left + pageWidth, y)
        .strokeColor("#999999")
        .lineWidth(0.5)
        .stroke();
      y += 6;
    };

    drawSummaryHeader();
    for (const c of model.categories) {
      ensureSpace(18);
      doc.fontSize(9).fillColor("#111111");
      doc.text(c.name, colX[0], y, { width: 110 });
      doc.text(c.shared ? "—" : yen(c.budget), colX[1], y, {
        width: 80,
        align: "right",
      });
      doc.text(yen(c.spent), colX[2], y, { width: 80, align: "right" });
      doc.text(c.shared ? "—" : yen(c.remaining), colX[3], y, {
        width: 80,
        align: "right",
      });
      doc.text(
        c.shared ? "小遣い合計枠から減算" : "",
        colX[4],
        y,
        { width: pageWidth - 390 },
      );
      y += 16;
    }

    y += 6;
    doc.y = y;
    line(
      `小遣い枠合計（家族・昼食・雑費の予算）: ${yen(model.pocketBudgetTotal)}`,
    );
    line(
      `小遣い枠からの支出（上記＋酒・お菓子・その他）: ${yen(model.pocketSpentTotal)}　残額: ${yen(model.pocketRemaining)}`,
    );
    line(
      `昼食の残り平日数: ${model.weekdayCount}日（会社休日 ${model.holidays.length}日を除外）`,
    );
    {
      const lunch = model.categories.find((c) => c.name === "昼食");
      if (lunch?.lunchDaily != null) {
        line(
          `昼食の一日上限: ${yen(lunch.lunchDaily)}（残額 ${yen(lunch.remaining)} ÷ 残り平日 ${model.weekdayCount}・切捨て）`,
        );
      }
    }

    y += 10;
    doc.y = y;
    line("【月間支出の内訳】", 11);
    line(
      `　日常生活費等（交通費を除く）: ${yen(model.monthTotal)}（${model.entryCount}件）`,
    );
    line(`　交通費: ${yen(model.transportTotal)}`);
    ensureSpace(8);
    doc
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.margins.left + Math.min(pageWidth, 320), y)
      .strokeColor("#666666")
      .lineWidth(0.5)
      .stroke();
    y += 8;
    doc.y = y;
    line(
      `月間支出総額（交通費を含む）: ${yen(model.grandTotal)}（全${model.entryCountAll}件）`,
      11,
    );
    line(
      "※ 上表の用途別支出を合算した額が総額です。交通費は独立予算のため、日常生活費（家族・昼食・雑費・酒・お菓子・その他）とは区分して記載しています。",
      8,
    );

    y += 12;
    doc.y = y;
    line("2. 支出明細", 12);
    y += 4;

    const detailCols = [
      doc.page.margins.left,
      doc.page.margins.left + 90,
      doc.page.margins.left + 170,
      doc.page.margins.left + 250,
    ];

    const drawDetailHeader = () => {
      ensureSpace(22);
      doc.fontSize(9).fillColor("#111111");
      doc.text("日付", detailCols[0], y, { width: 85 });
      doc.text("用途", detailCols[1], y, { width: 75 });
      doc.text("金額", detailCols[2], y, { width: 75, align: "right" });
      doc.text("摘要", detailCols[3], y, {
        width: pageWidth - 250,
      });
      y += 14;
      doc
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left + pageWidth, y)
        .strokeColor("#999999")
        .lineWidth(0.5)
        .stroke();
      y += 6;
    };

    drawDetailHeader();

    if (model.entries.length === 0) {
      ensureSpace(20);
      doc.fontSize(9).text("（該当期間の支出記録はありません）", doc.page.margins.left, y);
      y += 16;
    } else {
      let lastDate = "";
      for (const e of model.entries) {
        if (lastDate && lastDate !== e.date) {
          const day = model.dailyTotals.find((d) => d.date === lastDate);
          if (day) {
            ensureSpace(16);
            doc.fontSize(8).fillColor("#444444");
            doc.text(
              `　（${lastDate} 小計 ${yen(day.total)} / ${day.count}件）`,
              doc.page.margins.left,
              y,
              { width: pageWidth },
            );
            y += 14;
          }
        }
        if (y > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage();
          doc.font("Noto");
          y = doc.page.margins.top;
          drawDetailHeader();
        }
        doc.fontSize(9).fillColor("#111111");
        doc.text(e.date, detailCols[0], y, { width: 85 });
        doc.text(e.category, detailCols[1], y, { width: 75 });
        doc.text(yen(e.amount), detailCols[2], y, {
          width: 75,
          align: "right",
        });
        doc.text(e.memo || "—", detailCols[3], y, {
          width: pageWidth - 250,
        });
        y += 15;
        lastDate = e.date;
      }
      if (lastDate) {
        const day = model.dailyTotals.find((d) => d.date === lastDate);
        if (day) {
          ensureSpace(16);
          doc.fontSize(8).fillColor("#444444");
          doc.text(
            `　（${lastDate} 小計 ${yen(day.total)} / ${day.count}件）`,
            doc.page.margins.left,
            y,
            { width: pageWidth },
          );
          y += 14;
        }
      }
    }

    y += 20;
    doc.y = y;
    ensureSpace(80);
    doc
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.margins.left + pageWidth, y)
      .strokeColor("#333333")
      .lineWidth(0.8)
      .stroke();
    y += 12;
    doc.y = y;
    line("以上", 11);
    y += 6;
    doc.y = y;
    doc.fontSize(8).fillColor("#444444");
    doc.text(
      "備考: 本明細書は、作成者が家計管理アプリに入力した日常生活費の記録を、対象年月ごとに集計・出力したものです。用途区分（家族・昼食・雑費・酒・お菓子・その他・交通費等）は作成者の管理区分に基づきます。「雑費」予算は雑費・酒・お菓子の合計で消化します。「その他」は家族・昼食・雑費の合計予算枠から減算する共通支出です。月間支出総額は交通費を含む全支出の合計です。金額の単位は日本円です。",
      {
        width: pageWidth,
        lineGap: 2,
      },
    );

    // Footer page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Noto").fontSize(8).fillColor("#666666");
      doc.text(
        `${i + 1} / ${range.count}`,
        doc.page.margins.left,
        doc.page.height - 36,
        { width: pageWidth, align: "center" },
      );
    }

    doc.end();
  });
}
