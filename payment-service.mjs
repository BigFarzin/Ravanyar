/** Shared, idempotent payment finalization for the web app and Bale bot. */
export async function activatePayment(
  pool,
  {
    paymentId,
    gateway,
    authority = null,
    refId = null,
    balePayload = null,
    baleChargeId = null,
  },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [payment],
    } = await client.query(
      `SELECT p.*, o.user_id, o.plan_id, o.coupon_code, o.amount AS order_amount,
              o.discount_amount, o.final_amount, o.status AS order_status
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1 FOR UPDATE OF p, o`,
      [paymentId],
    );

    if (!payment) throw new Error("پرداخت یافت نشد.");
    if (payment.status === "paid") {
      await client.query("COMMIT");
      return { alreadyPaid: true, payment };
    }
    if (payment.status !== "pending" || payment.order_status !== "pending") {
      throw new Error("سفارش در وضعیت قابل پرداخت نیست.");
    }

    await client.query(
      `UPDATE payments
       SET status='paid', gateway=$1, authority=$2, ref_id=$3,
           bale_payload=COALESCE($4, bale_payload),
           bale_charge_id=COALESCE($5, bale_charge_id), paid_at=NOW()
       WHERE id=$6`,
      [gateway, authority, refId, balePayload, baleChargeId, payment.id],
    );
    await client.query(
      "UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1",
      [payment.order_id],
    );

    const usageLimit =
      payment.plan_id === "silver" ? 3 : payment.plan_id === "gold" ? 9 : null;
    await client.query(
      `INSERT INTO subscriptions(user_id, plan_id, status, starts_at, ends_at, usage_limit, usage_count)
       VALUES($1,$2,'active',NOW(),NOW() + INTERVAL '30 days',$3,0)
       ON CONFLICT(user_id) DO UPDATE SET
         plan_id=EXCLUDED.plan_id, status='active', starts_at=EXCLUDED.starts_at,
         ends_at=EXCLUDED.ends_at, usage_limit=EXCLUDED.usage_limit, usage_count=0`,
      [payment.user_id, payment.plan_id, usageLimit],
    );

    if (payment.coupon_code) {
      const {
        rows: [redemption],
      } = await client.query(
        `INSERT INTO coupon_redemptions(coupon_id,user_id,order_id)
         SELECT id,$1,$2 FROM coupons WHERE code=$3
         ON CONFLICT DO NOTHING RETURNING id`,
        [payment.user_id, payment.order_id, payment.coupon_code],
      );
      if (redemption)
        await client.query(
          "UPDATE coupons SET used_count=used_count+1 WHERE code=$1",
          [payment.coupon_code],
        );
    }

    const invoiceNo = `RY-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
    await client.query(
      `INSERT INTO invoices(invoice_no,order_id,user_id,amount,discount_amount,final_amount,status)
       VALUES($1,$2,$3,$4,$5,$6,'issued') ON CONFLICT(order_id) DO NOTHING`,
      [
        invoiceNo,
        payment.order_id,
        payment.user_id,
        payment.order_amount,
        payment.discount_amount,
        payment.final_amount,
      ],
    );
    await client.query(
      "INSERT INTO notifications(user_id,title,body,type) VALUES($1,$2,$3,$4)",
      [
        payment.user_id,
        "پرداخت موفق",
        `اشتراک ${payment.plan_id} فعال شد و فاکتور صادر گردید.`,
        "payment",
      ],
    );
    await client.query("COMMIT");
    return { alreadyPaid: false, payment };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
