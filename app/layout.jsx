import '../src/index.css';
import '../src/ui-foundations.css';
import '../src/theme.css';
import { themeInitScript } from '../src/theme.js';

export const metadata = {
  title: 'WalkingPad · Catálogo',
  description: 'Consulta y trabajo local',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
