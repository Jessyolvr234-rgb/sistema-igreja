import Image from "next/image";
import Link from "next/link";
import styles from "./access-status.module.css";

export default function PendingAccessPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Image
          alt="Rede Emaús"
          className={styles.logo}
          height={84}
          priority
          src="/rede-emaus.png"
          width={188}
        />
        <span className={styles.icon} aria-hidden="true">⌛</span>
        <span className={styles.eyebrow}>SOLICITAÇÃO DE ACESSO</span>
        <h1>Aguardando aprovação</h1>
        <p>
          Sua conta foi criada, mas ainda não está liberada para acessar a
          plataforma. Confirme seu e-mail, se solicitado, e aguarde a análise
          de um administrador.
        </p>
        <Link className={styles.button} href="/entrar">
          Voltar para entrar
        </Link>
        <Link className={styles.homeLink} href="/">
          Voltar à página inicial
        </Link>
      </section>
    </main>
  );
}
