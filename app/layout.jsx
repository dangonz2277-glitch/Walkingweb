import '../src/index.css';

export const metadata = {
  title: 'WalkingPad · Catálogo',
  description: 'Consulta y trabajo local',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
