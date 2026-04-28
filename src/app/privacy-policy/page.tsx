'use client';

import styles from '../legal.module.css';

export default function PrivacyPolicy() {
  return (
    <div className={`${styles.container} container`}>
      <header className={styles.header}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: April 28, 2026</p>
      </header>

      <div className={styles.content}>
        <p className={styles.intro}>
          At Singularity, we respect your privacy. This policy explains how we collect, use, and protect your data when you use our platform and services.
        </p>

        {/* 1. Who We Are */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Who We Are</h2>
          <p className={styles.text}>
            Singularity is a drum and bass collective based in Oslo, Norway.
          </p>
        </section>

        {/* 2. Data We Collect */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Data We Collect</h2>
          <p className={styles.text}>
            We collect information that you provide to us directly or that is generated through your use of the platform, including:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>Email address and display name</li>
            <li className={styles.listItem}>Account and profile information</li>
            <li className={styles.listItem}>Comments, community interactions, and reactions</li>
            <li className={styles.listItem}>Membership and Rave Points activity</li>
            <li className={styles.listItem}>Ticket order details and purchase history</li>
            <li className={styles.listItem}>Payment and order references</li>
            <li className={styles.listItem}>Event attendance or access information where relevant</li>
          </ul>
        </section>

        {/* 3. Why We Process Data */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Why We Process Data</h2>
          <p className={styles.text}>
            We use your data for the following purposes:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>Account management and authentication</li>
            <li className={styles.listItem}>Managing membership benefits and Rave Points</li>
            <li className={styles.listItem}>Facilitating event access and ticket verification</li>
            <li className={styles.listItem}>Processing ticket purchases and sending order confirmations</li>
            <li className={styles.listItem}>Payment processing and fraud prevention</li>
            <li className={styles.listItem}>Providing customer support</li>
            <li className={styles.listItem}>Communicating regarding event changes, cancellations, or refunds</li>
            <li className={styles.listItem}>Ensuring platform security and stability</li>
          </ul>
        </section>

        {/* 4. Transactional Emails */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Transactional Emails</h2>
          <p className={styles.text}>
            We use your email address to send transactional emails related to your account, membership access, ticket purchases, payment confirmations, event changes, refunds, and customer support.
          </p>
          <p className={styles.text}>
            Transactional emails are necessary for providing the service and are not marketing emails.
          </p>
        </section>

        {/* 5. Marketing Emails */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Marketing Emails</h2>
          <p className={styles.text}>
            Marketing emails, newsletters, or promotional event announcements will only be sent if you explicitly opt in.
          </p>
          <p className={styles.text}>
            You can unsubscribe from marketing emails at any time.
          </p>
          <p className={styles.text}>
            We do not treat ticket confirmation emails, account emails, payment emails, or event change notifications as marketing emails.
          </p>
        </section>

        {/* 6. Payments */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Payments</h2>
          <p className={styles.text}>
            Payments may be processed by Vipps/MobilePay or another payment provider shown at checkout.
          </p>
          <p className={styles.text}>
            Singularity does not store full credit card details on our own servers. Payment providers may process your information according to their own privacy terms and security standards.
          </p>
        </section>

        {/* 7. Service Providers */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Service Providers</h2>
          <p className={styles.text}>
            We may use trusted third-party providers to operate our platform and services, including:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}><strong>Supabase:</strong> For authentication and database services</li>
            <li className={styles.listItem}><strong>Vercel:</strong> For hosting and infrastructure</li>
            <li className={styles.listItem}><strong>Resend:</strong> For transactional email delivery</li>
            <li className={styles.listItem}><strong>Vipps/MobilePay:</strong> For payment processing</li>
          </ul>
        </section>

        {/* 8. Storage and Security */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Storage and Security</h2>
          <p className={styles.text}>
            Your data is stored securely in Supabase databases and hosted on Vercel. We implement reasonable technical and organisational security measures to protect your information against unauthorised access or loss.
          </p>
          <p className={styles.text}>
            While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee its absolute security.
          </p>
        </section>

        {/* 9. Your Rights */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Your Rights</h2>
          <p className={styles.text}>
            You have the right to access, correct, or request the deletion of your personal data. You also have the right to:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>Withdraw your consent for marketing communications at any time</li>
            <li className={styles.listItem}>Object to certain types of processing</li>
            <li className={styles.listItem}>Request a copy of your data in a portable format</li>
          </ul>
          <p className={styles.text}>
            To exercise these rights, please contact us at the email address below.
          </p>
        </section>

        {/* 10. Contact */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Contact</h2>
          <p className={styles.text}>
            For any questions about this Privacy Policy or your personal data, contact us at:
          </p>
          <p className={styles.text}>
            <strong>info@singularity-oslo.no</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
