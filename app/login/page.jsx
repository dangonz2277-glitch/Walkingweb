export const metadata = {
  title: 'Acceso - WalkingPad',
};

export default function Login() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>
      <h1>Acceso Protegido</h1>
      <form action="/api/login" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          type="password" 
          name="password" 
          placeholder="Contraseña del sitio" 
          required 
          style={{ padding: '8px', fontSize: '16px' }}
        />
        <button type="submit" style={{ padding: '8px 16px', fontSize: '16px', cursor: 'pointer' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}
