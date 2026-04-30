import { NextResponse } from 'next/server';
import { requireCompany, unauthorized, serverError } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const cid = await requireCompany();

    // Added trendStats as the 6th query in the Promise.all array
    const [empStats, payStats, deptStats, leaveStats, recentPay, trendStats] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='ACTIVE'   THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status='INACTIVE' THEN 1 ELSE 0 END) AS inactive,
                SUM(CASE WHEN status='ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave
         FROM employees WHERE company_id=:cid`,
        { cid }
      ),
      query(
        `SELECT NVL(SUM(gross_salary),0) AS total_gross,
                NVL(SUM(net_salary),0)   AS total_net,
                NVL(SUM(pf_deduction),0) AS total_pf,
                NVL(SUM(tax_deduction),0) AS total_tax,
                COUNT(*) AS count
         FROM payroll
         WHERE company_id=:cid
           AND pay_month=EXTRACT(MONTH FROM SYSDATE)
           AND pay_year =EXTRACT(YEAR  FROM SYSDATE)`,
        { cid }
      ),
      query(
        `SELECT dept_name, COUNT(e.emp_id) AS headcount
         FROM departments d
         LEFT JOIN employees e ON e.dept_id=d.dept_id AND e.status='ACTIVE'
         WHERE d.company_id=:cid
         GROUP BY dept_name ORDER BY headcount DESC`,
        { cid }
      ),
      query(
        `SELECT COUNT(*) AS pending FROM leaves
         WHERE company_id=:cid AND status='PENDING'`,
        { cid }
      ),
      query(
        `SELECT full_name, dept_name, net_salary, pay_month, pay_year, status
         FROM vw_payroll WHERE company_id=:cid
         ORDER BY processed_at DESC NULLS LAST FETCH FIRST 6 ROWS ONLY`,
        { cid }
      ),
      // NEW QUERY: Fetch monthly trend data for the bar chart
      query(
        `SELECT pay_month,
                NVL(SUM(gross_salary),0) AS total_gross,
                NVL(SUM(net_salary),0)   AS total_net
         FROM payroll
         WHERE company_id=:cid
           AND pay_year = EXTRACT(YEAR FROM SYSDATE)
         GROUP BY pay_month
         ORDER BY pay_month ASC`,
        { cid }
      ),
    ]);
    
    return NextResponse.json({
      employees:     empStats.rows[0],
      payroll:       payStats.rows[0],
      departments:   deptStats.rows,
      leaves:        leaveStats.rows[0],
      recentPayroll: recentPay.rows,
      // NEW: Send the trend data back to the frontend
      payrollTrend:  trendStats.rows,
    });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}