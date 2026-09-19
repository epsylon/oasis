const { form, button, div, h2, p, section, input, span, table, thead, tbody, tr, td, th, ul, li, a, br, label, img } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n, userLink, renderWalletChip } = require('./main_views');

const walletViewRender = (balance, address, ...elements) => {
    const header = div({ class: 'tags-header module-header-line' }, h2(i18n.walletTitle), p(i18n.walletDescription), renderWalletChip());
    return template(
        i18n.walletTitle,
        section(
            header,
            div({ class: "wallet-section" },
                h2(i18n.walletAddress),
                div({ class: "wallet-address" }, h2({ class: "element" }, address || "-")),
                h2(i18n.walletBalanceTitle),
                div({ class: "div-center" }, h2(i18n.walletBalanceLine({ balance: Number(balance || 0).toFixed(6) }))),
                div({ class: "div-center" },
                    span({ class: "wallet-form-button-group-center" },
                        form({ action: "/wallet/send", method: "get" }, button({ type: 'submit' }, i18n.walletSend)),
                        form({ action: "/wallet/receive", method: "get" }, button({ type: 'submit' }, i18n.walletReceive)),
                        form({ action: "/wallet/history", method: "get" }, button({ type: 'submit' }, i18n.walletHistory))
                    )
                )
            )
        ),
        elements.length > 0 ? section(...elements) : null
    );
};

exports.walletView = async (balance, address) => {
    return walletViewRender(balance, address);
};

exports.walletHistoryView = async (balance, transactions, address) => {
    const rows = Array.isArray(transactions) ? transactions : [];
    return walletViewRender(
        balance,
        address,
        h2(i18n.walletHistoryTitle),
        table(
            { class: "wallet-history" },
            thead(
                tr(
                    { class: "full-center" },
                    th({ class: "col-10" }, i18n.walletCnfrs),
                    th(i18n.walletDate),
                    th(i18n.walletType),
                    th(i18n.walletAmount),
                    th({ class: "col-30" }, i18n.walletTxId)
                )
            ),
            tbody(
                ...rows.map(tx => {
                    const date = new Date((tx.time || tx.timereceived || 0) * 1000);
                    const amount = Number(tx.amount) || 0;
                    const fee = Number(tx.fee) || 0;
                    const totalAmount = amount + fee;
                    return tr(
                        td({ class: "full-center" }, String(tx.confirmations || 0)),
                        td(moment(date).format("YYYY/MM/DD"), br(), moment(date).format("HH:mm")),
                        td(tx.category || "-"),
                        td(totalAmount.toFixed(6)),
                        td({ width: "30%", class: "tcell-ellipsis" },
                            span({ class: "bank-address-code" }, tx.txid || "-")
                        )
                    );
                })
            )
        )
    );
};

exports.walletReceiveView = async (balance, address) => {
    return walletViewRender(
        balance,
        address,
        h2(i18n.walletReceiveTitle),
        address
            ? div({ class: 'div-center qr-code' }, img({ src: `/wallet/qr/${encodeURIComponent(address)}`, alt: 'QR', class: 'wallet-qr-img' }))
            : null
    );
};

exports.walletSendFormView = async (balance, destination, amount, fee, statusMessages, address, options = {}) => {
    const transferCtx = options.transfer || null;
    const paymentRef = options.payment || null;
    const type = statusMessages?.type || 'info';
    const titleKey = statusMessages?.title || '';
    const messages = statusMessages?.messages || [];
    const statusBlock = messages.length > 0
        ? div(
            { class: `wallet-status-${type}` },
            span(i18n.walletStatusMessages[titleKey] || titleKey || ''),
            ul(...messages.map(error => li(i18n.walletStatusMessages[error] || error)))
        )
        : null;

    return walletViewRender(
        balance,
        address,
        h2(i18n.walletWalletSendTitle),
        div(
            { class: "div-center" },
            statusBlock,
            form(
                { action: '/wallet/send', method: 'POST' },
                label({ for: 'destination' }, i18n.walletAddress), br(),
                input({ type: 'text', id: 'destination', name: 'destination', placeholder: 'ETQ17sBv8QFoiCPGKDQzNcDJeXmB2317HX', value: destination || '' }), br(),
                label({ for: 'amount' }, i18n.walletAmount), br(),
                input({ type: 'text', id: 'amount', name: 'amount', placeholder: '0.25', value: amount || '' }), br(),
                label({ for: 'fee' }, i18n.walletFee), br(),
                input({ type: 'text', id: 'fee', name: 'fee', placeholder: '0.01', value: fee || '' }), br(),
                paymentRef
                    ? div({ class: 'wallet-transfer-ctx' },
                        div({ class: 'wallet-transfer-ctx-line' }, span({ class: 'wallet-transfer-ctx-label' }, `${i18n.walletPayeeLabel}: `), userLink(paymentRef.payeeId)),
                        div({ class: 'wallet-transfer-ctx-line' }, span({ class: 'wallet-transfer-ctx-label' }, `${i18n.walletConceptLabel}: `), paymentRef.href ? a({ href: paymentRef.href }, paymentRef.concept || paymentRef.href) : span(paymentRef.concept)),
                        input({ type: 'hidden', name: 'payeeId', value: paymentRef.payeeId }),
                        input({ type: 'hidden', name: 'concept', value: paymentRef.concept || '' }),
                        input({ type: 'hidden', name: 'refHref', value: paymentRef.href || '' }),
                        input({ type: 'hidden', name: 'refTag', value: paymentRef.tag || 'WALLET' })
                      )
                    : null,
                transferCtx
                    ? div({ class: 'wallet-transfer-ctx' },
                        span({ class: 'wallet-transfer-ctx-label' }, `${i18n.walletPayingTransfer}: `),
                        a({ href: `/transfers/${encodeURIComponent(transferCtx.id)}` }, transferCtx.concept || transferCtx.id),
                        input({ type: 'hidden', name: 'transferId', value: transferCtx.id })
                      )
                    : label({ class: 'wallet-create-transfer' },
                        input({ type: 'checkbox', name: 'createTransfer', value: '1', ...(options.createTransfer ? { checked: true } : {}) }),
                        ` ${i18n.walletCreateTransferLabel}`
                      ),
                br(),
                input({ type: 'hidden', name: 'action', value: 'confirm' }),
                div({ class: 'wallet-form-button-group-center' },
                    button({ type: 'submit' }, i18n.walletSend),
                    button({ type: 'reset' }, i18n.walletReset)
                )
            )
        )
    );
};

exports.walletSendConfirmView = async (balance, destination, amount, fee, options = {}) => {
    const amountNum = Number(amount || 0);
    const feeNum = Number(fee || 0);
    const totalCost = amountNum + feeNum;
    return walletViewRender(
        balance,
        destination,
        p(
            i18n.walletAddressLine({ address: destination || '-' }), br(),
            i18n.walletAmountLine({ amount: amountNum.toFixed(6) }), br(),
            i18n.walletFeeLine({ fee: feeNum.toFixed(6) }), br(),
            i18n.walletTotalCostLine({ totalCost: totalCost.toFixed(6) })
        ),
        form(
            { action: '/wallet/send', method: 'POST' },
            input({ type: 'hidden', name: 'action', value: 'send' }),
            input({ type: 'hidden', name: 'destination', value: destination || '' }),
            input({ type: 'hidden', name: 'amount', value: String(amountNum) }),
            input({ type: 'hidden', name: 'fee', value: String(feeNum) }),
            options.transfer ? input({ type: 'hidden', name: 'transferId', value: options.transfer.id }) : null,
            options.createTransfer ? input({ type: 'hidden', name: 'createTransfer', value: '1' }) : null,
            options.transfer ? p({ class: 'wallet-transfer-ctx' }, `${i18n.walletPayingTransfer}: ${options.transfer.concept || options.transfer.id}`) : null,
            options.payment ? input({ type: 'hidden', name: 'payeeId', value: options.payment.payeeId }) : null,
            options.payment ? input({ type: 'hidden', name: 'concept', value: options.payment.concept || '' }) : null,
            options.payment ? input({ type: 'hidden', name: 'refHref', value: options.payment.href || '' }) : null,
            options.payment ? input({ type: 'hidden', name: 'refTag', value: options.payment.tag || 'WALLET' }) : null,
            options.payment ? div({ class: 'wallet-transfer-ctx' },
                div({ class: 'wallet-transfer-ctx-line' }, span({ class: 'wallet-transfer-ctx-label' }, `${i18n.walletPayeeLabel}: `), userLink(options.payment.payeeId)),
                div({ class: 'wallet-transfer-ctx-line' }, span({ class: 'wallet-transfer-ctx-label' }, `${i18n.walletConceptLabel}: `), options.payment.concept || options.payment.href)
              ) : null,
            div({ class: 'form-button-group-center' },
                button({ type: 'submit' }, i18n.walletConfirm),
                a({ href: `/wallet/send`, class: "button-like-link" }, i18n.walletBack)
            )
        )
    );
};

exports.walletSendResultView = async (balance, destination, amount, txId, note = null) => {
    return walletViewRender(
        balance,
        destination,
        p(
            i18n.walletSentToLine({ destination: destination || '-', amount: Number(amount || 0).toFixed(6) }), br(),
            `${i18n.walletTransactionId}: `,
            span({ class: "bank-address-code" }, txId || '-')
        ),
        note ? p({ class: 'wallet-transfer-ctx' }, note) : null
    );
};

exports.walletErrorView = async (error) => {
    const header = div({ class: 'tags-header module-header-line' }, h2(i18n.walletTitle), p(i18n.walletDescription), renderWalletChip());
    return template(
        i18n.walletTitle,
        section(
            header,
            div({ class: "wallet-error" }, h2(i18n.walletStatus), p(i18n.walletDisconnected))
        )
    );
};

