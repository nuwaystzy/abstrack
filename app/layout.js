import "./globals.css";

export const metadata = {
  title: "AbsTrack",
  description: "Track which apps a wallet has interacted with on Abstract chain",
  icons: {
    icon: "https://da0a8d63d0723a01b9d7d92ba8c7e1cf.cdn.bubble.io/cdn-cgi/image/w=192,h=192,f=auto,dpr=1,fit=contain/f1768235344559x240854847891804900/Abstract_AppIcon_DarkMode.png"
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}