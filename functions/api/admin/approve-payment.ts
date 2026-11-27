// Credit wallet - 30% owner fee, user gets 70%
if (targetUserId && paymentAmount) {
  const fee = paymentAmount * 0.30;
  const net = paymentAmount - fee;

  await env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`).bind(net, targetUserId).run();

  await env.DB.prepare(`INSERT INTO wallet_transactions (user_id, amount, fee_amount, net_amount, type, description, status, created_at) VALUES (?, ?, ?, ?, 'credit', 'Deposit confirmed - 30% owner fee deducted', 'completed', ?)`).bind(targetUserId, paymentAmount, fee, net, nowIso).run();
}
