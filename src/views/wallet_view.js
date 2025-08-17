const { form, button, div, h2, p, section, input, span, table, thead, tbody, tr, td, th, ul, li, a, br, label } = require("../server/node_modules/hyperaxe");
const QRCode = require('../server/node_modules/qrcode');
const { template, i18n } = require('./main_views');

const walletViewRender = (balance, address, ...elements) => {
    const header = div({ class: 'tags-header' }, h2(i18n.walletTitle), p(i18n.walletDescription));
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
                        td(date.toLocaleDateString(), br(), date.toLocaleTimeString()),
                        td(tx.category || "-"),
                        td(totalAmount.toFixed(6)),
                        td({ width: "30%", class: "tcell-ellipsis" },
                            a({ href: `https://ecoin.03c8.net/blockexplorer/search?q=${encodeURIComponent(tx.txid || '')}`, target: "_blank" }, tx.txid || "-")
                        )
                    );
                })
            )
        )
    );
};

exports.walletReceiveView = async (balance, address) => {
    const qrImage = await QRCode.toString(address || '', { type: 'svg' });
    return walletViewRender(
        balance,
        address,
        h2(i18n.walletReceiveTitle),
        div({ class: 'div-center qr-code', innerHTML: qrImage })
    );
};

exports.walletSendFormView = async (balance, destination, amount, fee, statusMessages, address) => {
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
                input({ type: 'hidden', name: 'action', value: 'confirm' }),
                div({ class: 'wallet-form-button-group-center' },
                    button({ type: 'submit' }, i18n.walletSend),
                    button({ type: 'reset' }, i18n.walletReset)
                )
            )
        )
    );
};

exports.walletSendConfirmView = async (balance, destination, amount, fee) => {
    const a = Number(amount || 0);
    const f = Number(fee || 0);
    const totalCost = a + f;
    return walletViewRender(
        balance,
        destination,
        p(
            i18n.walletAddressLine({ address: destination || '-' }), br(),
            i18n.walletAmountLine({ amount: a.toFixed(6) }), br(),
            i18n.walletFeeLine({ fee: f.toFixed(6) }), br(),
            i18n.walletTotalCostLine({ totalCost: totalCost.toFixed(6) })
        ),
        form(
            { action: '/wallet/send', method: 'POST' },
            input({ type: 'hidden', name: 'action', value: 'send' }),
            input({ type: 'hidden', name: 'destination', value: destination || '' }),
            input({ type: 'hidden', name: 'amount', value: String(a) }),
            input({ type: 'hidden', name: 'fee', value: String(f) }),
            div({ class: 'form-button-group-center' },
                button({ type: 'submit' }, i18n.walletConfirm),
                a({ href: `/wallet/send`, class: "button-like-link" }, i18n.walletBack)
            )
        )
    );
};

exports.walletSendResultView = async (balance, destination, amount, txId) => {
    return walletViewRender(
        balance,
        destination,
        p(
            i18n.walletSentToLine({ destination: destination || '-', amount: Number(amount || 0).toFixed(6) }), br(),
            `${i18n.walletTransactionId}: `,
            a({ href: `https://ecoin.03c8.net/blockexplorer/search?q=${encodeURIComponent(txId || '')}`, target: "_blank" }, txId || '-')
        )
    );
};

exports.walletErrorView = async (error) => {
    const header = div({ class: 'tags-header' }, h2(i18n.walletTitle), p(i18n.walletDescription));
    return template(
        i18n.walletTitle,
        section(
            header,
            div({ class: "wallet-error" }, h2(i18n.walletStatus), p(i18n.walletDisconnected))
        )
    );
};

