# CAS current-holdings import

The KFintech/CAMS CAS importer treats each statement as an authoritative current-position
snapshot. It does not stage SIP, purchase, or other historical transaction lines alongside the
closing balance, because doing both would count the same units twice.

For each supported statement, the parser:

- associates scheme identities, masked folios, and closing summaries by their statement order;
- rejects the document if those structural counts differ;
- parses closing units and NAV with the shared fixed-point utilities;
- aggregates multiple folios with the same ISIN into one holding; and
- derives the current review value from cumulative units multiplied by the statement NAV.

Commit remains append-only. A new asset receives a reconciliation event for the full position. An
existing asset receives only `target CAS units - current units`, expressed as
`reconciliation_in` or `reconciliation_out`. Re-importing the same balance therefore produces no
additional position event.

Closing an existing manual asset is a soft close, not a deletion. Its row and history remain in the
database, it leaves active net-worth views, and a later CAS import creates a new replacement asset
because matching considers only open assets.

## Discarding an uncommitted import

Queued, parsing, review-ready, and failed batches can be permanently deleted from the CAS import
screen. Deletion removes the encrypted temporary payload and staged review rows, releases the file
hash so the same PDF can be uploaded again, and does not touch assets or position events. Completed,
committing, reverting, and reverted batches remain protected because they may have append-only
portfolio history.
