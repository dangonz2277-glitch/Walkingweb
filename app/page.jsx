import fs from 'fs';
import path from 'path';
import App from '../src/App';

export default function Page() {
  const dataDir = path.join(process.cwd(), 'data');
  const initialData = {
    categories: JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf-8')),
    products: JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf-8')),
    sourceIssues: JSON.parse(fs.readFileSync(path.join(dataDir, 'issues_complete.json'), 'utf-8')),
    guide: JSON.parse(fs.readFileSync(path.join(dataDir, 'guia.json'), 'utf-8')),
    generalIssues: JSON.parse(fs.readFileSync(path.join(dataDir, 'general_issues.json'), 'utf-8'))
  };

  return <App initialData={initialData} />;
}
