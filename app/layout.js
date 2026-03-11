import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "AbsTrack",
  description: "Track which apps a wallet has interacted with on Abstract chain",
  icons: {
    icon: "https://i.ibb.co.com/84GgW8z4/Poster-Menyambut-Ramadan-dalam-Gaya-Kartun-Ceria-3.png"
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

