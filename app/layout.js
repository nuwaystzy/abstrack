import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "AbsTrack",
  description: "Track which apps a wallet has interacted with on Abstract chain",
  icons: {
    icon: "https://i.postimg.cc/nzP2JwPr/Poster-Menyambut-Ramadan-dalam-Gaya-Kartun-Ceria-(5).png",
    shortcut: "https://i.postimg.cc/nzP2JwPr/Poster-Menyambut-Ramadan-dalam-Gaya-Kartun-Ceria-(5).png",
    apple: "https://i.postimg.cc/nzP2JwPr/Poster-Menyambut-Ramadan-dalam-Gaya-Kartun-Ceria-(5).png",
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


