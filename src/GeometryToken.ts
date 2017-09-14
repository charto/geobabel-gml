import * as cxml from 'cxml';
import * as geo from 'geobabel';

declare module 'geobabel/dist/geometry/Geometry' {

	interface Geometry {
		writeGML(config: cxml.ParserConfig, output?: cxml.TokenBuffer): cxml.TokenBuffer;
	}

}

declare module 'geobabel/dist/geometry/GeometryCollection' {

	interface GeometryCollection {
		multiName?: string;
		membersName?: string;
	}

}

geo.Point.prototype.writeGML = function(
	this: geo.Point,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Point = tokens['gml:Point'] as cxml.OpenToken;
	const gml_pos = tokens['gml:pos'] as cxml.OpenToken;

	output.push(
		gml_Point,
		gml_Point.emitted,
		gml_pos,
		gml_pos.emitted,
		this.pos.join(' '),
		gml_pos.close,
		gml_Point.close
	);

	return(output);
}

geo.LineString.prototype.writeGML = function(
	this: geo.LineString,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_LineString = tokens['gml:LineString'] as cxml.OpenToken;
	const gml_posList = tokens['gml:posList'] as cxml.OpenToken;

	output.push(
		gml_LineString,
		gml_LineString.emitted,
		gml_posList,
		gml_posList.emitted,
		this.writeWKT(geo.wktDefaults),
		gml_posList.close,
		gml_LineString.close
	);

	return(output);
}

geo.Polygon.prototype.writeGML = function(
	this: geo.Polygon,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Polygon = tokens['gml:Polygon'] as cxml.OpenToken;
	const gml_LinearRing = tokens['gml:LinearRing'] as cxml.OpenToken;
	const gml_posList = tokens['gml:posList'] as cxml.OpenToken;
	const gml_interior = tokens['gml:interior'] as cxml.OpenToken;
	let wrapper = tokens['gml:exterior'] as cxml.OpenToken;

	output.push(
		gml_Polygon,
		gml_Polygon.emitted,
	);

	for(let child of this.childList) {
		if(child) {
			output.push(
				wrapper,
				wrapper.emitted,
				gml_LinearRing,
				gml_LinearRing.emitted,
				gml_posList,
				gml_posList.emitted,
				child.writeWKT(geo.wktDefaults),
				gml_posList.close,
				gml_LinearRing.close,
				wrapper.close,
			);
		}

		wrapper = gml_interior;
	}

	output.push(
		gml_Polygon.close
	);

	return(output);
}

geo.GeometryCollection.prototype.multiName = 'gml:MultiGeometry';
geo.GeometryCollection.prototype.membersName = 'gml:geometryMembers';

geo.MultiPoint.prototype.multiName = 'gml:MultiPoint';
geo.MultiPoint.prototype.membersName = 'gml:pointMembers';

geo.MultiLineString.prototype.multiName = 'gml:MultiLineString';
geo.MultiLineString.prototype.membersName = 'gml:lineStringMembers';

geo.MultiPolygon.prototype.multiName = 'gml:MultiPolygon';
geo.MultiPolygon.prototype.membersName = 'gml:polygonMembers';

geo.MultiCurve.prototype.multiName = 'gml:MultiCurve';
geo.MultiCurve.prototype.membersName = 'gml:curveMembers';

geo.MultiSurface.prototype.multiName = 'gml:MultiSurface';
geo.MultiSurface.prototype.membersName = 'gml:surfaceMembers';

geo.GeometryCollection.prototype.writeGML = function(
	this: geo.GeometryCollection,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Multi = tokens[this.multiName!] as cxml.OpenToken;
	const gml_Members = tokens[this.membersName!] as cxml.OpenToken;

	output.push(
		gml_Multi,
		gml_Multi.emitted,
		gml_Members,
		gml_Members.emitted,
	);

	for(let child of this.childList) {
		if(child && child.writeGML) child.writeGML(config, output);
	}

	output.push(
		gml_Members.close,
		gml_Multi.close
	);

	return(output);
}

export class GeometryToken extends cxml.Token {

	constructor(public geometry: geo.Geometry) { super(); }

	serialize(indent: string, config: cxml.ParserConfig): string | cxml.TokenBuffer {
		return(this.geometry.writeGML(config));
	}

}
