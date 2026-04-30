import { NextResponse } from 'next/server';
import { requireCompany, unauthorized, serverError } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req) {
  try {
    const cid = await requireCompany();
    const { searchParams } = new URL(req.url);
    
    // Parse as integers to match the POST route and likely DB schema
    const monthParam = searchParams.get('month');
    const yearParam  = searchParams.get('year');
    
    const month = monthParam ? parseInt(monthParam, 10) : null;
    const year  = yearParam ? parseInt(yearParam, 10) : null;

    let sql = `SELECT * FROM vw_payroll WHERE company_id = :cid`;
    const binds = { cid };
    
    if (month && !isNaN(month)) { 
      sql += ` AND pay_month = :month`; 
      binds.month = month; 
    }
    
    if (year && !isNaN(year)) { 
      sql += ` AND pay_year = :year`; 
      binds.year = year; 
    }
    
    sql += ` ORDER BY pay_year DESC, pay_month DESC, full_name`;

    const result = await query(sql, binds);
    return NextResponse.json({ data: result.rows });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}

export async function POST(req) {
  try {
    const cid = await requireCompany();
    
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const { month, year } = body;
    
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    // Call the Oracle stored procedure
    await query(
      `BEGIN process_payroll(:cid, :month, :year); END;`,
      { 
        cid, 
        month: parseInt(month, 10), 
        year: parseInt(year, 10) 
      }
    );
    
    return NextResponse.json({ message: `Payroll processed successfully for ${month}/${year}` }, { status: 201 });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    
    // Catch common PL/SQL execution errors gracefully
    if (e.message && e.message.includes('ORA-')) {
      console.error('PL/SQL Error in process_payroll:', e);
      return NextResponse.json({ error: 'Database error occurred while processing payroll.' }, { status: 500 });
    }
    
    return serverError(e);
  }
}

export async function PUT(req) {
  try {
    const cid = await requireCompany();
    
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const { month, year } = body;
    
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    // Mark payroll as PAID
    const result = await query(
      `UPDATE payroll SET status = 'PAID'
       WHERE company_id = :cid 
         AND pay_month = :month 
         AND pay_year = :year 
         AND status = 'PROCESSED'`,
      { 
        cid, 
        month: parseInt(month, 10), 
        year: parseInt(year, 10) 
      }
    );

    // Optional: You can check result.rowsAffected here if your query function returns it
    // to inform the user if 0 rows were actually updated (e.g., if they were already PAID).
    
    return NextResponse.json({ message: `Payroll marked as paid for ${month}/${year}` });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}