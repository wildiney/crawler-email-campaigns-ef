import puppeteer from 'puppeteer';
import * as fs from 'fs';
// import * as path from "path"

class Crawler {
  protected wsChromeEndpointurl: string
  protected downloadPath: string
  protected mainURL
  public campaigns: any = []
  public filesToDownload: any = []

  constructor(
    mainURL: string,
    wsChromeEndpointurl: string,
    downloadPath: string,
  ) {
    this.wsChromeEndpointurl = wsChromeEndpointurl
    this.downloadPath = downloadPath
    this.mainURL = mainURL
    console.log("start")
  }

  crawl() {
    (async () => {
      const browser = await puppeteer.connect({
        browserWSEndpoint: this.wsChromeEndpointurl
      })
      const page = await browser.newPage()
      page.on('console', (msg) => console.log('Campanhas:', msg.text()))
      await page.goto(`${process.env.SITE}index.aspx`, { waitUntil: 'networkidle2' })

      await this.selectAmountRegisterByPage(page)

      const pagesToCrawl = await this.getAmountOfPagesToCrawl(page)
      for (let pageNumber = 1; pageNumber <= pagesToCrawl + 1; pageNumber++) {
        console.log("Crawling page", pageNumber, "of", pagesToCrawl)
        if (pageNumber > 1) {
          this.selectPage(pageNumber, page)
        }
        await page.waitForTimeout(3000)
        console.log("Crawling page", pageNumber)

        const campaigns = await this.getCampaigns(page)
        this.campaigns.push(...campaigns)
      }
      console.log(this.campaigns)
      console.log("qtd", this.campaigns.length)
      console.log("last item", this.campaigns[this.campaigns.length - 1])

      await this.getCampaignData(page)
      console.log(this.filesToDownload)
      console.log("qtd", this.filesToDownload.length)
      console.log("last item", this.filesToDownload[this.filesToDownload.length - 1])

      await this.downloadFiles(page)

      console.log("Finished")

      page.close()
    })()


  }

  async selectAmountRegisterByPage(page: puppeteer.Page): Promise<void> {
    console.log("Selecting amount of registers")
    await page.waitForTimeout(2000)
    page.click('#ddlTamañoPagina')
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(4000)
  }

  async selectPage(pageNumber: number, page: puppeteer.Page) {
    console.log("Selecting page to crawl")
    await page.click(`#lblPaginacion > a:nth-child(${pageNumber})`)
    await page.waitForNavigation({
      waitUntil: 'networkidle2'
    })

    await page.waitForTimeout(4000)
  }

  async getAmountOfPagesToCrawl(page: puppeteer.Page) {
    console.log("Getting the amount of pages to be crawled")
    const numberOfPages = await page.evaluate(() => {
      return document.querySelector('#lblPaginacion > a:nth-last-child(2)')!.innerHTML
    })
    return +numberOfPages
  }

  async getCampaigns(page: puppeteer.Page) {
    page.waitForNavigation({ waitUntil: 'networkidle2' })
    const allCampaigns = await page.evaluate(() => {
      const pageCampaigns: Array<{ campaignName: string, url: string | null }> = []
      const campaignNames = Array.from(
        document.querySelectorAll(
          '#form1 > div.container > div.main > div > div.content > table > tbody > tr:not(:nth-child(1)) > td:nth-child(5)'
        )
      )
      const urls = Array.from(
        document.querySelectorAll('.buttons1 a:nth-child(2)')
      )

      for (let i = 0; i < campaignNames.length; i++) {
        try {
          pageCampaigns.push({
            campaignName: (campaignNames[i] as HTMLElement).innerText,
            url: (urls[i] as HTMLAnchorElement).getAttribute('href')
          })
        } catch (e) {
          console.log('error pushing campaign names', e)
        }
      }

      return pageCampaigns
    })
    return allCampaigns
  }

  async getCampaignData(page: puppeteer.Page) {
    for (const campaign of this.campaigns) {
      await page.goto(`${process.env.SITE}${campaign.url}`, {
        waitUntil: 'networkidle2'
      })

      const filesToDownload = await page.evaluate(() => {
        const name = (document.getElementById('lblCampaña') as HTMLSpanElement)!.innerText
        const campaignDate = (document.getElementById('lblFechaEnvio') as HTMLSpanElement)!.innerText.split(' ')[0].replaceAll('/', '-')
        const date = Array.from(document.querySelectorAll('.cont_tables')[0].querySelectorAll('tr:not(:nth-child(1)) td:nth-child(1)'))
        const file = Array.from(document.querySelectorAll('.cont_tables')[0].querySelectorAll('tr:not(:nth-child(1)) td:nth-child(2) a')
        )
        const data = []
        for (let i = 0; i < date.length; i++) {
          try {
            data.push({
              campaignName: name,
              campaignDate: campaignDate,
              date: (date[i] as HTMLTableElement).innerText,
              url: file[i].getAttribute('href')
            })
          } catch (e) {
            console.log('error pushing campaign data', e)
          }
        }
        return data
      })

      this.filesToDownload.push(...filesToDownload)
    }
  }

  formatDate(date: string, from = 'dd-mm-yyyy') {
    if (from === 'dd-mm-yyyy') {
      const day = date.split('-')[0]
      const month = date.split('-')[1]
      const year = date.split('-')[2]
      return `${year}-${('0' + month).slice(-2)}-${('0' + day).slice(-2)}`
    }
  }

  translateDate(date: string) {
    const text = date
      .replace('ene', 'jan')
      .replace('abr', 'apr')
      .replace('mai', 'may')
      .replace('ago', 'aug')
      .replace('set', 'sep')
      .replace('dic', 'dec')
    return text
  }

  async downloadFiles(page: puppeteer.Page) {
    for (const file of this.filesToDownload) {
      console.log('date', this.formatDate(file.campaignDate))
      const filePath = `./files/${this.formatDate(file.campaignDate)} - ${file.campaignName
        }`
      if (!fs.existsSync(`${filePath}/${new Date(this.translateDate(file.date)).toISOString().split('T')[0].substring(5, 10)}-${file.campaignName}.csv`)) {
        await page.goto(`${process.env.SITE}${file.url}`, {
          waitUntil: 'networkidle2'
        })
        console.log('Current File', file)
        if (!fs.existsSync(filePath)) {
          await fs.mkdir(filePath, (err) => {
            if (err) console.log('error making directory', err)
          })
        }
        await (page as any)._client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: this.downloadPath
        })
        await page.click('#linkDescarga')
        await page.waitForTimeout(4000)
        try {
          fs.renameSync(
            './files/rcd.csv',
            `${filePath}/${new Date(this.translateDate(file.date))
              .toISOString()
              .split('T')[0]
              .substring(5, 10)}-${file.campaignName}.csv`
          )
        } catch (e) {
          console.log(e)
        }

        page.waitForTimeout(1500)
      }
    }
  }

}


const crawler = new Crawler(
  `${process.env.SITE}index.aspx`,
  `${process.env.WS}`,
  './files'
)
const data = crawler.crawl()