const functions = require("firebase-functions");
const axios = require("axios");
const admin = require("firebase-admin");

exports.sync = functions.https.onCall(async ({userToken, userID}) => {
    if (!userToken || !userID) {
        return "check params";
    }

    /*
    CMS data: deal type (recurent, custom date, one-time), day of the week / date, code
    Spoonity perks: earning rules, we extract award links below
    */
    const [cms, perks] = await axios.all([getCMSData(), getSpoonityPerks()]);

    const now = new Date(perks.headers.date);
    const unixNow = Math.floor(now.getTime() / 1000);

    const today = extractDate(
        new Date(
            now.toLocaleString("en-US", {
                timeZone: "Asia/Dubai",
            })
        )
    );

    const dayOfWeek = now.toLocaleString("en-US", {
        timeZone: "Asia/Dubai",
        weekday: "long",
    });

    //if user doc doesn't exist - create it
    const user = admin.firestore().collection("deals").doc(userID);
    let docRef = await user.get();
    const newEntry = !docRef.exists;

    if (newEntry) {
        await user.set({});
        docRef = await user.get();
    }
    const docData = docRef.data();

    //filtering active deals
    const todaysDealsCms = cms.data.data.deals
        .filter(
            (deal) =>
                deal.dealType?.dayOfWeek?.includes(dayOfWeek) ||
                (deal.dealType?.customDates &&
                    compareDates(deal.dealType?.customDates, today)) ||
                (deal.oneTimeDeal && !docData[deal.code])
        )
        .map((deal) => deal.code);

    functions.logger.info("todaysDealsCms", todaysDealsCms);

    const activeDeals = extractActiveDeals(
        perks,
        todaysDealsCms,
        unixNow,
        docData
    );

    const redeemedDeals = {};
    const requests = [];

    activeDeals.forEach((deal) => requests.push(claimDeal(deal, userToken)));

    await axios.all(requests).then(
        (responses) => {
            responses.forEach((_, index) => {
                //timestamp to avoid reapplying deals the same day
                redeemedDeals[activeDeals[index]] = unixNow;
            });
        },
        (error) => {
            functions.logger.info("error:", error.response.data);
        }
    );

    if (Object.keys(redeemedDeals).length > 0) {
        await user.update(redeemedDeals);
    }

    functions.logger.info(dayOfWeek, "redeemedDeals", redeemedDeals);
    return "OK";
});

function compareDates(dates, today) {
    const dateMatch = dates.find((d) => {
        const dealDate = extractDate(new Date(d));
        if (isSameDay(dealDate, today)) {
            // console.log("match", dealDate, today);
            return true;
        }
    });

    return !!dateMatch;
}

function isSameDay(now, comparedDate) {
    return (
        now.day === comparedDate.day &&
        now.month === comparedDate.month &&
        now.year === comparedDate.year
    );
}

function extractDate(date) {
    return {
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
    };
}

function getCMSData() {
    return axios.post(CMS_API_URL, JSON.stringify({query: CMS_DEALS_QUERY}), {
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${CMS_API_KEY}`,
        },
    });
}

function getSpoonityPerks() {
    return axios.get("https://api-dunkin.spoonity.com/vendor/1054633/perks");
}

function claimDeal(code, userToken) {
    return axios.post(
        "https://api-dunkin.spoonity.com/vendor/promotion/award.json",
        JSON.stringify({code}),
        {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            params: {
                session_key: userToken,
            },
        }
    );
}

function extractActiveDeals(perks, todaysDealsCms, unixNow, docData) {
    const active_deals = [];

    /*
    Looking for earning rules with award link (w/ code param).
    If a deal was applied before, at least full day must pass.
    Award link should be active and within the active period.
    */

    try {
        perks.data.forEach((e) => {
            if (todaysDealsCms.includes(e.code)) {
                let shouldUpdate = false;
                if (docData[e.code]) {
                    shouldUpdate = docData[e.code] + 86400 < unixNow;
                } else {
                    shouldUpdate = true;
                }

                if (
                    shouldUpdate &&
                    e.perkType.name === "Redeemable Link" &&
                    e.status.name === "Active" &&
                    e.start_date < unixNow &&
                    e.end_date > unixNow
                ) {
                    active_deals.push(e.code);
                }
            }
        });
    } catch (e) {
        console.log("extractDeals:ERROR:", e);
    }

    return active_deals;
}

const CMS_API_URL =
    "https://api-ap-south-1.graphcms.com/v2/ckxdy1raq4iz901yzaagjcgk9/master";

const CMS_API_KEY =
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImdjbXMtbWFpbi1wcm9kdWN0aW9uIn0.eyJ2ZXJzaW9uIjozLCJpYXQiOjE2NDAyMDM1NTQsImF1ZCI6WyJodHRwczovL2FwaS1hcC1zb3V0aC0xLmdyYXBoY21zLmNvbS92Mi9ja3hkeTFyYXE0aXo5MDF5emFhZ2pjZ2s5L21hc3RlciIsImh0dHBzOi8vbWFuYWdlbWVudC1uZXh0LmdyYXBoY21zLmNvbSJdLCJpc3MiOiJodHRwczovL21hbmFnZW1lbnQuZ3JhcGhjbXMuY29tLyIsInN1YiI6IjIxODM0OGM1LTgxNTktNGRkOS04YjM3LThjNmM4NGUyODkxMyIsImp0aSI6ImNreGh5dWkycTF1eHQwMXowMmtuZWJmNngifQ.vNdJ383GhDA8476HySwx9RrZeszeDtLVF_VCUv2WXqaqqe5P5exiC2gPlFRv8yVUlBSMvmoLxxbP3ZjR9pzXX4Ej4AhCJDW2fw-Bu_s_PQ-8PJz-tIW1AQ-iLGWcUu1QqXE8IfMrKc6tD0n2cxgDaKYEqiG8Av5tMJVt6SuYCvNmGFbiUZBBxp7Vo_CACoE3ahBV480PPEtCNBOGQ4itMJnxbJxCyZDboN92kDnd0GAx8suFUx7rRJocszdjbNDsJPV5By6obvHezHQ_2jlzeKXUOyEJD-VosQYvm3XkqGygYbdGibocIMjOYqCWaQnpF_Emr9LR41dgCXumQPFt7JNCrgG_Ld56jNmaYe9VqczMo98gc36cN4D7m9MU19YWA0ZJGzYJFtZATpjWUYpiyqKeuwWe4Px_roawsYkrFMpUNvm4mXVcVH7GucrZFJtp6LIBv6yVustiJLBwgMKG1X2MbNdWV5t8EATQtJmyJaZO_KbPnYN5l-rE1QXU-nrQ6f4rZoN1x9EGdfSjbjL5g5lqNoaOI7S7a7HfG3i8wK1xD7Z4tHFPdjxq_p0R93Yl95J_iZolshyixbP0BGEAMsKdArXLqq5MVXEcupuHBwoEYv-I2TLRg8MVlMqeAf89NxkHc4QQ1bQmWTfngN4rWd61HK9Yg7oFHJ7SP3ioC9o";

const CMS_DEALS_QUERY = `{
    deals {
      code
      dayOfWeek
      customDates
      oneTimeDeal
      dealType {
        ... on CustomDateDeal {
          customDates
        }
        ... on WeeklyDeal {
          dayOfWeek
        }
      }
    }
  }`;
