import { Router } from 'express';
import { getTodayUsage, getUsageHistory, DAILY_BUDGET_USD } from '../costGuard.js';

const router = Router();

router.get('/', (_req, res) => {
  const today = getTodayUsage();
  res.json({
    today,
    dailyBudgetUSD: DAILY_BUDGET_USD,
    remainingUSD: Math.max(0, DAILY_BUDGET_USD - today.estimatedCostUSD),
    budgetExceeded: today.estimatedCostUSD >= DAILY_BUDGET_USD,
    history: getUsageHistory(30)
  });
});

export default router;
