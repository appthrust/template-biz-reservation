import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "予約・貸出",
  description: "会議室と備品の予約、貸出・返却をひとつの場所で管理します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
