\set ON_ERROR_STOP on

begin transaction isolation level repeatable read read only;

do $verify$
begin
  if exists (
    select 1
    from transactions
    where amount_minor <= 0
  ) then
    raise exception 'ledger invariant failed: transaction amount_minor must be positive';
  end if;

  if exists (
    select 1
    from transactions as transaction
    join accounts as account on account.id = transaction.account_id
    where account.user_id <> transaction.user_id
  ) then
    raise exception 'tenancy invariant failed: transaction and account owners differ';
  end if;

  if exists (
    with deltas as (
      select
        account_id,
        sum(
          case
            when type = 'income' then amount_minor
            else -amount_minor
          end
        )::bigint as net_minor
      from transactions
      group by account_id
    )
    select 1
    from accounts as account
    left join deltas on deltas.account_id = account.id
    where account.balance_minor
      <> account.opening_balance_minor + coalesce(deltas.net_minor, 0)
  ) then
    raise exception 'ledger invariant failed: account balance cache drift detected';
  end if;

  if exists (
    select 1
    from transactions as reversal
    left join transactions as original on original.id = reversal.reversal_of
    where reversal.status = 'reversal'
      and (
        reversal.reversal_of is null
        or original.id is null
        or original.user_id <> reversal.user_id
        or original.account_id <> reversal.account_id
        or original.amount_minor <> reversal.amount_minor
        or original.type = reversal.type
        or original.status <> 'reversed'
        or original.reversed_by is distinct from reversal.id
      )
  ) then
    raise exception 'ledger invariant failed: malformed reversal transaction';
  end if;

  if exists (
    select 1
    from transactions as original
    left join transactions as reversal on reversal.id = original.reversed_by
    where original.status = 'reversed'
      and (
        original.reversed_by is null
        or reversal.id is null
        or reversal.reversal_of is distinct from original.id
      )
  ) then
    raise exception 'ledger invariant failed: reversed transaction has no matching reversal';
  end if;

  if exists (
    select 1
    from transactions
    where status = 'posted'
      and (reversal_of is not null or reversed_by is not null)
  ) then
    raise exception 'ledger invariant failed: posted transaction contains reversal links';
  end if;

  if exists (
    select 1
    from transactions
    where transfer_group_id is not null
    group by transfer_group_id
    having count(*) <> 2
      or count(distinct user_id) <> 1
      or count(*) filter (where type = 'income') <> 1
      or count(*) filter (where type = 'expense') <> 1
      or min(amount_minor) <> max(amount_minor)
  ) then
    raise exception 'ledger invariant failed: malformed transfer pair';
  end if;

  if exists (
    select 1
    from audit_log as audit
    left join transactions as transaction
      on transaction.id::text = audit.entity_id
      and transaction.user_id = audit.user_id
    where audit.action in (
      'transaction.create',
      'transaction.update',
      'transaction.reverse',
      'transfer.create',
      'transfer.reverse',
      'recurring.materialize'
    )
      and transaction.id is null
  ) then
    raise exception 'audit invariant failed: transaction audit entry has no owned transaction';
  end if;
end
$verify$;

select
  (select count(*) from accounts) as account_count,
  (select count(*) from transactions) as transaction_count,
  (select count(*) from audit_log) as audit_entry_count;

rollback;
