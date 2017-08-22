import * as stream from 'stream';

import * as cxml from 'cxml';
import { Geometry, Point, LineString, Polygon } from 'geobabel';

const tokenTbl: cxml.TokenTbl = {
	gml: {
		uri: 'http://www.opengis.net/gml',
		elements: [
			'LineString',
			'LinearRing',
			'Point',
			'Polygon',
			'exterior',
			'interior',
			'pos',
			'posList'
		],
		attributes: [
			'srsDimension',
			'srsName'
		]
	}
};

export class Parser<WrapperToken extends cxml.Token> {

	constructor(public Wrapper: { new(geometry: Geometry): WrapperToken }) {
		this.xmlConfig = new cxml.ParserConfig({ parseUnknown: true });

		this.xmlConfig.bindNamespace(cxml.processing);
		this.xmlConfig.bindNamespace(cxml.anonymous);
		this.xmlConfig.addNamespace(cxml.xml1998);

		this.registry = this.xmlConfig.registerTokens(tokenTbl);
	}

	parse(streamIn: stream.Readable) {
		const xmlParser = this.xmlConfig.createParser();
		const streamOut = new ParserStream(this.Wrapper, this.registry);

		streamIn.pipe(xmlParser).pipe(streamOut);

		return(streamOut);
	}

	xmlConfig: cxml.ParserConfig;
	registry: cxml.Registry;
}

export class ParserStream<WrapperToken extends cxml.Token> extends stream.Transform {

	constructor(
		public Wrapper: { new(geometry: Geometry): WrapperToken },
		private registry: cxml.Registry
	) {
		super({ objectMode: true });
	}

	_transform(chunk: cxml.TokenBuffer | null, enc: string, flush: (err: any, chunk: cxml.TokenBuffer | null) => void) {
		if(!chunk) {
			flush(null, null);
			return;
		}

		const output: cxml.TokenBuffer = [];
		const gml_Point = this.registry.names['gml:Point'];
		const gml_LineString = this.registry.names['gml:LineString'];
		const gml_Polygon = this.registry.names['gml:Polygon'];
		const gml_interior = this.registry.names['gml:interior'];
		const gml_exterior = this.registry.names['gml:exterior'];
		const gml_LinearRing = this.registry.names['gml:LinearRing'];
		const gml_pos = this.registry.names['gml:pos'];
		const gml_posList = this.registry.names['gml:posList'];

		let token = chunk[0];

		let depth = this.depth;
		let captureDepth = this.captureDepth;
		let isPos = this.isPos;
		let coordList = this.coordList;
		let ringList = this.ringList;

		let lastNum = token instanceof cxml.RecycleToken ? token.lastNum : chunk.length - 1;
		let tokenNum = -1;

		output.push(token);

		while(tokenNum < lastNum) {

			token = chunk[++tokenNum];

			if(token instanceof cxml.MemberToken) {
				if(token.kind == cxml.TokenKind.open) {
					++depth;
					if(depth < captureDepth && this.registry.elements[token.id!]) captureDepth = depth;
				}

				if(token.kind == cxml.TokenKind.string) {
					if(this.registry.attributes[token.id!]) {
					} else if(depth < captureDepth) output.push(token);
				} else if(this.registry.elements[token.id!]) {
					switch(token.id) {
						case gml_Point:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							} else if(token.kind == cxml.TokenKind.close && coordList) {
								output.push(new this.Wrapper(new Point(coordList[0], coordList[1])));
								coordList = void 0;
							}

							break;

						case gml_LineString:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							} else if(token.kind == cxml.TokenKind.close && coordList) {
								output.push(new this.Wrapper(new LineString(coordList)));
								coordList = void 0;
							}

							break;

						case gml_Polygon:

							if(token.kind == cxml.TokenKind.open) {
								ringList = [ null ];
							} else if(token.kind == cxml.TokenKind.close && ringList) {
								output.push(new this.Wrapper(new Polygon(ringList)));
								ringList = void 0;
							}

							break;

						case gml_interior:
						case gml_exterior:

							if(token.kind == cxml.TokenKind.close && ringList && coordList) {
								if(token.id == gml_interior) {
									ringList.push(coordList);
								} else {
									// GML allows up to one exterior ring.
									ringList[0] = coordList;
								}

								coordList = void 0;
							}

							break;

						case gml_LinearRing:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							}

							break;

						case gml_pos:
						case gml_posList:

							if(token.kind == cxml.TokenKind.emitted) {
								isPos = true;
							} else if(token.kind == cxml.TokenKind.close) {
								isPos = false;
							}

							break;
					}
				} else if(depth < captureDepth) output.push(token);

				if(token.kind == cxml.TokenKind.close) {
					--depth;
					if(depth < captureDepth) captureDepth = Infinity;
				}
			} else {
				if(typeof(token) == 'string' && isPos && coordList) {
					coordList.push.apply(coordList, token.split(' ').map((num: string) => +num))
				} else if(depth < captureDepth) {
					output.push(token);
				}
			}
		}

		flush(null, output);

		this.depth = depth;
		this.captureDepth = captureDepth;
		this.isPos = isPos;
		this.coordList = coordList;
		this.ringList = ringList;
	}

	depth = 0;
	captureDepth = Infinity;
	isPos = false;
	coordList: number[] | undefined;
	ringList: (number[] | null)[] | undefined;
}
