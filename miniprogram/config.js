module.exports = {
  projectExId: 'PO76RBe9KX0',
  graphqlUrl: 'https://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-v2',
  wsUrl: 'wss://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-subscription',
  statusOnShelf: '已上架',
  statusParsing: '解析中',
  statusDraft: '待审核',
  sourceLecturer: '讲师上传',
  sourceAdmin: '管理员上传',
  asyncFlowId: '28939557-ae3e-44e0-b6e6-b3cbec120a43',
  pptFlowId: 'c46e09e4-fd97-4027-b27b-87d6cd5b8a63',
  cozeTpaId: 'mu6ckpzl',
  // 在 Coze 控制台复制 Bot ID 填到这里。智学 TPA 已指向 https://api.coze.cn/v3/chat
  cozeBotId: '',
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
