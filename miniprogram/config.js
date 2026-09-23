module.exports = {
  projectExId: 'PO76RBe9KX0',
  graphqlUrl: 'https://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-v2',
  wsUrl: 'wss://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-subscription',
  statusOnShelf: '已上架',
  statusParsing: '解析中',
  statusDraft: '待审核',
  sourceLecturer: '讲师上传',
  sourceAdmin: '管理员上传',
  adminPhones: ['17742415497'],
  adminAccountIds: ['1000000000000006'],
  devAdmin: {
    enabled: true,
    username: 'zhixue-admin',
    password: 'ZhixueAdmin2026'
  },
  asyncFlowId: '8e640419-2243-41b5-92c4-0dd349b97f2d',
  pptFlowId: 'c46e09e4-fd97-4027-b27b-87d6cd5b8a63',
  pptGenerateTpaId: 'yv04e96e8',
  pptExportTpaId: 'hgf937snh',
  cozeTpaId: 'mu6ckpzl',
  cozeMessageTpaId: 'r43leo7de',
  cozeBotId: '7683760370368380964',
  agents: {
    structure: {
      id: 'p9abeup2h',
      name: '解析-结构提取',
      args: { fullText: 'wjvxpuy4l' }
    },
    summary: {
      id: 'v6rkmlglx',
      name: '解析-摘要生成',
      args: { fullText: 'v0r1oesut', chaptersJson: 'r7yyldw1r' }
    },
    tags: {
      id: 'tbuerjgxe',
      name: '解析-标签推荐',
      args: { fullText: 'n4y0hkaaz', summariesJson: 'hnfa3ujhc' }
    }
  }
}
