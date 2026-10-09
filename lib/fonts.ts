import { Bricolage_Grotesque } from "next/font/google";

/** The only typeface. Its opsz and wdth axes do the work a second family would. */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});
