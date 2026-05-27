import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/demo-neurociencia.pdf");

function escapeText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const lines = [
  { size: 12, y: 760, text: "Neurociencia cognitiva" },
  { size: 12, y: 760, x: 375, text: "Capitulo 2. Procesamiento de la informacion" },
  { size: 18, y: 710, text: "2.3  Atencion y seleccion de informacion" },
  { size: 12, y: 670, text: "La atencion es el mecanismo por el cual los organismos seleccionan" },
  { size: 12, y: 650, text: "informacion relevante e inhiben la irrelevante. Este proceso es fundamental" },
  { size: 12, y: 630, text: "dado que los sistemas sensoriales estan expuestos a una enorme cantidad" },
  { size: 12, y: 610, text: "de estimulos, pero los recursos de procesamiento son limitados." },
  { size: 12, y: 570, text: "Los modelos teoricos proponen que la atencion puede operar en niveles:" },
  { size: 12, y: 532, text: "- Atencion selectiva: focaliza el procesamiento en un canal sensorial" },
  { size: 12, y: 512, x: 86, text: "o en una ubicacion espacial determinada." },
  { size: 12, y: 482, text: "- Atencion sostenida: mantiene el estado de alerta y el rendimiento" },
  { size: 12, y: 462, x: 86, text: "a lo largo del tiempo." },
  { size: 12, y: 432, text: "- Atencion ejecutiva: controla la seleccion de metas y la resolucion" },
  { size: 12, y: 412, x: 86, text: "de conflictos entre respuestas." },
  { size: 12, y: 368, text: "Estudios con tecnicas de neuroimagen han identificado redes" },
  { size: 12, y: 348, text: "frontoparietales y el cingulo anterior como areas clave en el control" },
  { size: 12, y: 328, text: "atencional. Estas regiones interactuan con areas sensoriales para" },
  { size: 12, y: 308, text: "modular el flujo de informacion consciente." },
  { size: 16, y: 260, text: "2.3.1  Atencion selectiva" },
  { size: 12, y: 226, text: "La atencion selectiva permite priorizar ciertos estimulos mientras se" },
  { size: 12, y: 206, text: "inhiben otros. Un ejemplo clasico es el paradigma de la atencion dicotica." },
  { size: 12, y: 186, text: "Los participantes reportan predominantemente la informacion atendida." },
  { size: 12, y: 58, x: 298, text: "1" },
];

const content = [
  "BT",
  "/F1 12 Tf",
  "72 760 Td",
  ...lines.flatMap((line) => [
    `/F1 ${line.size} Tf`,
    `1 0 0 1 ${line.x ?? 72} ${line.y} Tm`,
    `(${escapeText(line.text)}) Tj`,
  ]),
  "ET",
].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [0];

for (let index = 0; index < objects.length; index += 1) {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const offset of offsets.slice(1)) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(pdf, "latin1"));
console.log(`Generated ${outputPath}`);
