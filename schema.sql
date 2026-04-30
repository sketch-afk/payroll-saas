-- ============================================================
--  PAYROLL SAAS — Multi-Tenant Oracle Schema
-- ============================================================

-- 1. COMPANIES (one row per registered company)
CREATE TABLE companies (
    company_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR2(150) NOT NULL,
    email           VARCHAR2(150) NOT NULL UNIQUE,
    password_hash   VARCHAR2(255),                    -- NULL for Google OAuth users
    logo_url        VARCHAR2(500),
    industry        VARCHAR2(100),
    country         VARCHAR2(100) DEFAULT 'India',
    currency        VARCHAR2(10)  DEFAULT 'INR',
    google_id       VARCHAR2(255) UNIQUE,             -- Google OAuth sub
    is_active       NUMBER(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- 2. DEPARTMENTS (scoped to company)
CREATE TABLE departments (
    dept_id     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    dept_name   VARCHAR2(100) NOT NULL,
    location    VARCHAR2(100),
    manager_id  NUMBER,                               -- FK to employees added later
    created_at  TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_dept UNIQUE (company_id, dept_name)
);

-- 3. EMPLOYEES (scoped to company)
CREATE TABLE employees (
    emp_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    dept_id     NUMBER REFERENCES departments(dept_id),
    first_name  VARCHAR2(50)  NOT NULL,
    last_name   VARCHAR2(50)  NOT NULL,
    email       VARCHAR2(150) NOT NULL,
    phone       VARCHAR2(20),
    hire_date   DATE NOT NULL,
    job_title   VARCHAR2(100),
    status      VARCHAR2(20) DEFAULT 'ACTIVE' 
                CHECK (status IN ('ACTIVE','INACTIVE','ON_LEAVE')),
    created_at  TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_emp_email UNIQUE (company_id, email)
);

-- Manager FK (FIXED: ON DELETE SET NULL to prevent Hard Delete crashes)
ALTER TABLE departments
    ADD CONSTRAINT fk_dept_manager
    FOREIGN KEY (manager_id) REFERENCES employees(emp_id) ON DELETE SET NULL;

-- 4. SALARY STRUCTURES
CREATE TABLE salary_structures (
    structure_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id      NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    emp_id          NUMBER NOT NULL REFERENCES employees(emp_id) ON DELETE CASCADE,
    basic_salary    NUMBER(12,2) NOT NULL,
    hra             NUMBER(12,2) DEFAULT 0,
    da              NUMBER(12,2) DEFAULT 0,
    ta              NUMBER(12,2) DEFAULT 0,
    medical         NUMBER(12,2) DEFAULT 0,
    pf_percent      NUMBER(5,2)  DEFAULT 12,
    tax_percent     NUMBER(5,2)  DEFAULT 10,
    effective_from  DATE NOT NULL,
    is_current      NUMBER(1) DEFAULT 1,
    CONSTRAINT uq_sal_current UNIQUE (emp_id, is_current)
);

-- 5. ATTENDANCE
CREATE TABLE attendance (
    att_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    emp_id      NUMBER NOT NULL REFERENCES employees(emp_id) ON DELETE CASCADE,
    att_date    DATE NOT NULL,
    status      VARCHAR2(20) DEFAULT 'PRESENT' 
                CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE')),
    check_in    TIMESTAMP,
    check_out   TIMESTAMP,
    CONSTRAINT uq_att UNIQUE (company_id, emp_id, att_date)
);

-- 6. LEAVES
CREATE TABLE leaves (
    leave_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    emp_id      NUMBER NOT NULL REFERENCES employees(emp_id) ON DELETE CASCADE,
    leave_type  VARCHAR2(30) CHECK (leave_type IN ('CASUAL','SICK','EARNED','MATERNITY','PATERNITY')),
    from_date   DATE NOT NULL,
    to_date     DATE NOT NULL,
    days        NUMBER GENERATED ALWAYS AS (to_date - from_date + 1) VIRTUAL,
    reason      VARCHAR2(500),
    status      VARCHAR2(20) DEFAULT 'PENDING' 
                CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    applied_at  TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- 7. PAYROLL
CREATE TABLE payroll (
    payroll_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id      NUMBER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    emp_id          NUMBER NOT NULL REFERENCES employees(emp_id) ON DELETE CASCADE,
    pay_month       NUMBER(2) NOT NULL,
    pay_year        NUMBER(4) NOT NULL,
    basic_salary    NUMBER(12,2) DEFAULT 0,
    hra             NUMBER(12,2) DEFAULT 0,
    da              NUMBER(12,2) DEFAULT 0,
    ta              NUMBER(12,2) DEFAULT 0,
    medical         NUMBER(12,2) DEFAULT 0,
    gross_salary    NUMBER(12,2) GENERATED ALWAYS AS 
                    (basic_salary + hra + da + ta + medical) VIRTUAL,
    pf_deduction    NUMBER(12,2) DEFAULT 0,
    tax_deduction   NUMBER(12,2) DEFAULT 0,
    other_deductions NUMBER(12,2) DEFAULT 0,
    net_salary      NUMBER(12,2) DEFAULT 0,
    days_worked     NUMBER(3) DEFAULT 0,
    days_in_month   NUMBER(3) DEFAULT 0,
    status          VARCHAR2(20) DEFAULT 'PROCESSED' 
                    CHECK (status IN ('PENDING','PROCESSED','PAID')),
    processed_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_payroll UNIQUE (company_id, emp_id, pay_month, pay_year)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_emp_company   ON employees(company_id);
CREATE INDEX idx_emp_dept      ON employees(dept_id);
CREATE INDEX idx_dept_company  ON departments(company_id);
CREATE INDEX idx_att_company   ON attendance(company_id, emp_id, att_date);
CREATE INDEX idx_pay_company   ON payroll(company_id, pay_year, pay_month);
CREATE INDEX idx_leave_company ON leaves(company_id, emp_id);
CREATE INDEX idx_sal_emp       ON salary_structures(emp_id, is_current);

-- ============================================================
-- VIEWS
-- ============================================================

-- Employee full details view
CREATE OR REPLACE VIEW vw_employees AS
SELECT
    e.emp_id, e.company_id,
    e.first_name || ' ' || e.last_name AS full_name,
    e.first_name, e.last_name, e.email, e.phone,
    e.hire_date, e.job_title, e.status,
    d.dept_id, d.dept_name,
    ss.basic_salary,
    NVL(ss.hra,0) AS hra,
    NVL(ss.da,0)  AS da,
    NVL(ss.ta,0)  AS ta,
    NVL(ss.medical,0) AS medical,
    NVL(ss.pf_percent,12)  AS pf_percent,
    NVL(ss.tax_percent,10) AS tax_percent,
    NVL(ss.basic_salary,0) + NVL(ss.hra,0) + NVL(ss.da,0) + 
    NVL(ss.ta,0) + NVL(ss.medical,0) AS gross_salary
FROM employees e
LEFT JOIN departments       d  ON d.dept_id  = e.dept_id
LEFT JOIN salary_structures ss ON ss.emp_id  = e.emp_id AND ss.is_current = 1;

-- Payroll summary view
CREATE OR REPLACE VIEW vw_payroll AS
SELECT
    p.payroll_id, p.company_id, p.pay_month, p.pay_year, p.status,
    e.emp_id, e.full_name, e.job_title, e.dept_name,
    p.basic_salary, p.hra, p.da, p.ta, p.medical,
    p.gross_salary, p.pf_deduction, p.tax_deduction,
    p.other_deductions, p.net_salary,
    p.days_worked, p.days_in_month, p.processed_at
FROM payroll p
JOIN vw_employees e ON e.emp_id = p.emp_id AND e.company_id = p.company_id;

-- ============================================================
-- STORED PROCEDURE — Process Monthly Payroll (FIXED MATH LOGIC)
-- ============================================================
CREATE OR REPLACE PROCEDURE process_payroll(
    p_company_id IN NUMBER,
    p_month      IN NUMBER,
    p_year       IN NUMBER
) AS
    v_days_in_month NUMBER;
BEGIN
    v_days_in_month := TO_NUMBER(
        TO_CHAR(
            LAST_DAY(TO_DATE(p_year||'-'||LPAD(p_month,2,'0')||'-01','YYYY-MM-DD')),
            'DD'
        )
    );

    FOR emp IN (
        SELECT e.emp_id,
               NVL(ss.basic_salary,0) AS basic_salary,
               NVL(ss.hra,0) AS hra,
               NVL(ss.da,0)  AS da,
               NVL(ss.ta,0)  AS ta,
               NVL(ss.medical,0)    AS medical,
               NVL(ss.pf_percent,12)  AS pf_percent,
               NVL(ss.tax_percent,10) AS tax_percent
        FROM   employees e
        JOIN   salary_structures ss 
               ON ss.emp_id = e.emp_id AND ss.is_current = 1
        WHERE  e.company_id = p_company_id
          AND  e.status     = 'ACTIVE'
    ) LOOP
        DECLARE
            v_days_worked NUMBER;
            v_gross       NUMBER;
            v_pf_ded      NUMBER;
            v_tax_ded     NUMBER;
            v_net         NUMBER;
        BEGIN
            -- Count attendance (default to full month if no records)
            SELECT NVL(
                SUM(CASE WHEN status='PRESENT'  THEN 1
                         WHEN status='HALF_DAY' THEN 0.5
                         ELSE 0 END),
                v_days_in_month
            )
            INTO v_days_worked
            FROM attendance
            WHERE company_id = p_company_id
              AND emp_id     = emp.emp_id
              AND EXTRACT(MONTH FROM att_date) = p_month
              AND EXTRACT(YEAR  FROM att_date) = p_year;

            -- 1. Get Full Base Amounts
            v_gross := emp.basic_salary + emp.hra + emp.da + emp.ta + emp.medical;

            -- 2. Prorate the Gross FIRST if attendance < full month
            IF v_days_worked < v_days_in_month THEN
                DECLARE
                    v_ratio NUMBER := v_days_worked / v_days_in_month;
                BEGIN
                    v_gross := ROUND(v_gross * v_ratio, 2);
                    emp.basic_salary := ROUND(emp.basic_salary * v_ratio, 2);
                END;
            END IF;

            -- 3. Calculate Deductions on the (now prorated) amounts
            v_pf_ded  := ROUND(emp.basic_salary * emp.pf_percent / 100, 2);
            v_tax_ded := ROUND(v_gross * emp.tax_percent / 100, 2);
            
            -- 4. Final Net
            v_net := v_gross - v_pf_ded - v_tax_ded;

            MERGE INTO payroll p
            USING DUAL
            ON (p.company_id = p_company_id 
                AND p.emp_id    = emp.emp_id 
                AND p.pay_month = p_month 
                AND p.pay_year  = p_year)
            WHEN MATCHED THEN UPDATE SET 
                p.basic_salary  = emp.basic_salary,
                p.hra           = emp.hra,
                p.da            = emp.da,
                p.ta            = emp.ta,
                p.medical       = emp.medical,
                p.pf_deduction  = v_pf_ded,
                p.tax_deduction = v_tax_ded,
                p.net_salary    = v_net,
                p.days_worked   = v_days_worked,
                p.days_in_month = v_days_in_month,
                p.status        = 'PROCESSED',
                p.processed_at  = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                company_id, emp_id, pay_month, pay_year, 
                basic_salary, hra, da, ta, medical, 
                pf_deduction, tax_deduction, net_salary, 
                days_worked, days_in_month, status, processed_at
            ) VALUES (
                p_company_id, emp.emp_id, p_month, p_year,
                emp.basic_salary, emp.hra, emp.da, emp.ta, emp.medical,
                v_pf_ded, v_tax_ded, v_net,
                v_days_worked, v_days_in_month, 'PROCESSED', SYSTIMESTAMP
            );
        END;
    END LOOP;
    COMMIT;
END;
/

COMMIT;