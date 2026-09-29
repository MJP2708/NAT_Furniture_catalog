import { IBM_Plex_Sans_Thai, Montserrat } from "next/font/google";

export const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

export const montserrat = Montserrat({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});
