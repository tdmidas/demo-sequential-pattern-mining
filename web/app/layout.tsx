import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
import { ShopProvider } from "@/components/shop-context";
import "./globals.css";

const body = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NextBasket · Gợi ý sản phẩm mua tiếp theo",
  description: "Demo ứng dụng khai thác mẫu tuần tự (GSP, SPADE, PrefixSpan) vào gợi ý sản phẩm cho cửa hàng trực tuyến.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ShopProvider>
          <Shell>{children}</Shell>
        </ShopProvider>
      </body>
    </html>
  );
}
