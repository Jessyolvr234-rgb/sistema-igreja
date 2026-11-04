import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.header}>
        <Link aria-label="Rede Êmaús, página inicial" className={styles.brand} href="/">
          <Image
            alt="Rede Emaús"
            className={styles.logo}
            height={84}
            priority
            src="/rede-emaus.png"
            width={188}
          />
          <span>
            <strong>Rede Êmaús</strong>
            <small>Gestão Igreja | Administração</small>
          </span>
        </Link>
        <Link className={styles.headerLink} href="/entrar">
          Acessar conta
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>GESTÃO E ORGANIZAÇÃO</span>
          <h1>Conectando pessoas, fortalecendo ministérios e organizando nossa igreja.</h1>
          <p>
            Um espaço para cuidar de cada conexão e acompanhar de perto o
            trabalho da Rede Êmaús.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/entrar">
              Entrar na plataforma
              <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.secondaryButton} href="/criar-conta">
              Criar minha conta
            </Link>
          </div>
          <div className={styles.note}>
            <span aria-hidden="true" />
            Acesso seguro, sujeito à aprovação da administração.
          </div>
        </div>

        <div aria-hidden="true" className={styles.visual}>
          <div className={styles.visualRing} />
          <div className={styles.visualCard}>
            <Image
              alt=""
              className={styles.visualLogo}
              height={84}
              src="/rede-emaus.png"
              width={188}
            />
            <span>Rede Êmaús</span>
            <strong>Gestão Igreja</strong>
            <small>Conexões que fortalecem a comunidade</small>
          </div>
          <span className={styles.visualDot} />
          <span className={styles.visualLine} />
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Rede Êmaús</span>
        <span>Gestão Igreja | Administração</span>
      </footer>
    </main>
  );
}
