import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Riffcademy",
    short_name: "Riffcademy",
    description: "Aprende guitarra de forma clara, visual y progresiva",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    // Generados por scripts/generate-app-icons.mjs: dibujo centrado dentro de la zona segura (40 %),
    // así que el mismo fichero sirve como icono normal y como "maskable" (Android lo recorta con su
    // propia forma sin cortar las baquetas).
    icons: [192, 512].flatMap((size) =>
      (["any", "maskable"] as const).map((purpose) => ({
        src: `/android-chrome-${size}x${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose,
      })),
    ),
  };
}
