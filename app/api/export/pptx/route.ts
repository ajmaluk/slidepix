import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import type { Presentation } from "@/lib/slides";

export const runtime = "nodejs";

function addSlideContent(pptx: PptxGenJS, presentation: Presentation) {
  presentation.slides.forEach((slide) => {
    const pptSlide = pptx.addSlide();
    const getBulletText = (color: string) => slide.content.map((point) => ({
      text: point,
      options: { bullet: true, fontSize: 18, color, breakLine: true },
    }));

    if (slide.layout === "title") {
      if (slide.imageUrl) {
        pptSlide.background = { path: slide.imageUrl };
        pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: "000000", transparency: 50 } });
      }
      pptSlide.addText(slide.title, {
        x: 0.5, y: "30%", w: "90%", h: 1.5,
        fontSize: 44, bold: true, align: "center",
        color: slide.imageUrl ? "FFFFFF" : "000000",
      });
      if (slide.content.length > 0) {
        pptSlide.addText(slide.content[0], {
          x: 1, y: "55%", w: "80%", h: 1,
          fontSize: 24, align: "center",
          color: slide.imageUrl ? "E0E0E0" : "666666",
        });
      }
    } else if (slide.layout === "split") {
      pptSlide.addText(slide.title, { x: 0.5, y: 0.5, w: "45%", h: 1, fontSize: 32, bold: true, color: "000000" });
      pptSlide.addText(getBulletText("333333"), { x: 0.5, y: 1.8, w: "40%", h: 3.5, fontSize: 18, color: "333333", valign: "top" });
      if (slide.imageUrl) {
        pptSlide.addImage({ path: slide.imageUrl, x: "50%", y: 0.5, w: "45%", h: 4.5 });
      }
    } else if (slide.layout === "image") {
      if (slide.imageUrl) {
        pptSlide.background = { path: slide.imageUrl };
        pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: "000000", transparency: 60 } });
      }
      pptSlide.addText(slide.title, { x: 0.5, y: 0.5, w: "90%", h: 1.5, fontSize: 40, bold: true, align: "center", color: "FFFFFF" });
      pptSlide.addText(getBulletText("FFFFFF"), { x: 1, y: 2.5, w: "80%", h: 3, fontSize: 22, color: "FFFFFF", align: "center", valign: "top" });
    } else if (slide.layout === "feature") {
      pptSlide.addText(slide.title, { x: 0.5, y: 0.5, w: "90%", h: 1, fontSize: 36, bold: true, align: "center", color: "000000" });
      const colWidth = 9 / Math.max(1, slide.content.length);
      slide.content.forEach((point, index) => {
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0.5 + index * colWidth,
          y: 2,
          w: colWidth - 0.5,
          h: 2.5,
          fill: { color: "F0F0F0" },
        });
        pptSlide.addText(point, {
          x: 0.5 + index * colWidth,
          y: 2,
          w: colWidth - 0.5,
          h: 2.5,
          fontSize: 20,
          bold: true,
          align: "center",
          color: "333333",
          valign: "middle",
        });
      });
    } else {
      if (slide.imageUrl) {
        pptSlide.addImage({ path: slide.imageUrl, x: 0, y: 0, w: "100%", h: "100%", transparency: 85 });
      }
      pptSlide.addText(slide.title, { x: 0.5, y: 0.5, w: "90%", h: 1, fontSize: 32, bold: true, color: "000000" });
      pptSlide.addText(getBulletText("333333"), { x: 0.5, y: 1.8, w: "90%", h: 3.5, fontSize: 18, color: "333333", valign: "top" });
    }

    if (slide.notes) pptSlide.addNotes(slide.notes);
  });
}

export async function POST(request: Request) {
  const presentation = (await request.json()) as Presentation;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  addSlideContent(pptx, presentation);

  const data = await pptx.write({ outputType: "nodebuffer" });
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${presentation.title.replace(/\s+/g, "_")}.pptx"`,
    },
  });
}
