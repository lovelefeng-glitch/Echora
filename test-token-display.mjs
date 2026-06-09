// 测试 formatUsage 函数
import { formatUsage } from './out/renderer/assets/index-j9tj4ozZ.js';

// 测试用例
const testCases = [
  { input: { input: 0, output: 0, totalTokens: 0 }, expected: '输入: 0 | 输出: 0 | 总计: 0' },
  { input: { input: 100, output: 50, totalTokens: 150 }, expected: '输入: 100 | 输出: 50 | 总计: 150' },
  { input: { input: null, output: null, totalTokens: null }, expected: '' },
  { input: { input: undefined, output: undefined, totalTokens: undefined }, expected: '' },
];

console.log('测试 formatUsage 函数...\n');

testCases.forEach((testCase, index) => {
  try {
    const result = formatUsage(testCase.input);
    const passed = result === testCase.expected;
    console.log(`测试 ${index + 1}: ${passed ? '✅ 通过' : '❌ 失败'}`);
    console.log(`  输入: ${JSON.stringify(testCase.input)}`);
    console.log(`  期望: ${testCase.expected}`);
    console.log(`  实际: ${result}`);
    console.log('');
  } catch (error) {
    console.log(`测试 ${index + 1}: ❌ 错误`);
    console.log(`  错误: ${error.message}`);
    console.log('');
  }
});
