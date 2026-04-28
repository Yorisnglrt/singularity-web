'use client';

import styles from '../legal.module.css';

export default function TermsOfSale() {
  return (
    <div className={`${styles.container} container`}>
      <header className={styles.header}>
        <h1 className={styles.title}>Terms of Sale</h1>
        <p className={styles.lastUpdated}>Last updated: April 28, 2026</p>
      </header>

      <div className={styles.content}>
        <p className={styles.intro}>
          These Terms of Sale apply to ticket purchases made through the Singularity website. By completing a purchase, you agree to these terms.
        </p>

        {/* 1. Seller / Merchant Information */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Seller / Merchant Information</h2>
          <p className={styles.text}>
            Seller: Singularity<br />
            Organisation number: 936 102 514<br />
            Registered address: Sverres gate 3B, 0652 Oslo<br />
            Country: Norge<br />
            Contact email: info@singularity-oslo.no<br />
            Phone: 91924274<br />
            Vipps merchant name: Singularity
          </p>
        </section>

        {/* 2. Products and Services */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Products and Services</h2>
          <p className={styles.text}>
            Singularity sells event tickets. The specific event, ticket type, price, age restriction, and included access will be shown before payment is completed.
          </p>
        </section>

        {/* 3. Prices and Currency */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Prices and Currency</h2>
          <p className={styles.text}>
            All prices are shown in NOK unless otherwise stated. Any applicable fees or charges will be shown before checkout is completed.
          </p>
        </section>

        {/* 4. Payment */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Payment</h2>
          <p className={styles.text}>
            Payments are currently processed through Vipps. Payment is completed when the customer confirms the payment in Vipps.
          </p>
        </section>

        {/* 5. Delivery */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Delivery</h2>
          <p className={styles.text}>
            Tickets are delivered electronically to the email address provided during checkout after successful payment.
          </p>
        </section>

        {/* 6. Event Access */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Event Access</h2>
          <p className={styles.text}>
            A valid ticket or confirmation may be required for event entry. Tickets are personal unless otherwise stated on the event or checkout page. Customers are responsible for entering correct contact information during checkout.
          </p>
          <p className={styles.text}>
            Singularity may refuse entry if a ticket is invalid, already used, copied, or obtained through unauthorised resale.
          </p>
        </section>

        {/* 7. Age Restrictions */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Age Restrictions</h2>
          <p className={styles.text}>
            Age restrictions vary by event and may be 18+, 20+, or 21+. The applicable age restriction will be shown on the event page and/or checkout before purchase. Customers may be required to show valid ID at the venue.
          </p>
          <p className={styles.text}>
            Failure to meet the event age restriction does not entitle the customer to a refund.
          </p>
        </section>

        {/* 8. Cancellation and Refunds */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Cancellation and Refunds</h2>
          <p className={styles.text}>
            All ticket purchases are final and non-refundable, unless the event is cancelled, postponed, or materially changed by Singularity.
          </p>
          <p className={styles.text}>
            If an event is cancelled by Singularity, customers will be offered a refund of the ticket price. If an event is postponed or materially changed by Singularity, customers will be informed about the available options, including the right to request a refund.
          </p>
          <p className={styles.text}>
            Approved refunds will normally be processed within 14 days. Booking fees, payment fees, or third-party service fees may be non-refundable where applicable.
          </p>
          <p className={styles.text}>
            Tickets cannot be refunded because the customer is unable to attend, entered incorrect information during checkout, or no longer wishes to attend.
          </p>
        </section>

        {/* 9. Right of Withdrawal */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Right of Withdrawal</h2>
          <p className={styles.text}>
            The statutory right of withdrawal does not normally apply to tickets for leisure, cultural, or event services provided on a specific date or within a specific period.
          </p>
          <p className={styles.text}>
            Because Singularity sells event tickets for specific events, ticket purchases are normally final once payment is completed. This does not affect any rights customers may have if an event is cancelled, postponed, or materially changed.
          </p>
        </section>

        {/* 10. Complaints */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Complaints</h2>
          <p className={styles.text}>
            Customers can contact us at info@singularity-oslo.no. Please include your name, contact details, order or payment reference if available, and a short description of the issue.
          </p>
        </section>

        {/* 11. Conflict Resolution */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Conflict Resolution</h2>
          <p className={styles.text}>
            We always aim to resolve complaints directly with our customers. If a dispute cannot be resolved directly with Singularity, consumers may contact the Norwegian Consumer Council (Forbrukerrådet) for guidance.
          </p>
        </section>

        {/* 12. Changes to These Terms */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Changes to These Terms</h2>
          <p className={styles.text}>
            Singularity may update these Terms of Sale when necessary. The version published on the website at the time of purchase applies to that purchase.
          </p>
        </section>

        {/* 13. Contact */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. Contact</h2>
          <p className={styles.text}>
            For any questions about these Terms of Sale, payments, refunds, tickets, or event access, contact:
          </p>
          <p className={styles.text}>
            info@singularity-oslo.no
          </p>
        </section>
      </div>
    </div>
  );
}
